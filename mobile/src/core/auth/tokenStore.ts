/**
 * @format
 */

/**
 * Storage key strictly isolated to authentication token storage.
 * Isolated from theme preference (@volunteer_mgmt:theme_preference).
 */
export const AUTH_TOKEN_STORAGE_KEY = '@volunteer_mgmt:auth_token';

export interface TokenStore {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

/**
 * In-memory fallback token store for tests and platforms without async storage.
 */
export class MemoryTokenStore implements TokenStore {
  private token: string | null = null;

  constructor(initialToken: string | null = null) {
    this.token = initialToken;
  }

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async setToken(token: string): Promise<void> {
    this.token = token.trim();
  }

  async clearToken(): Promise<void> {
    this.token = null;
  }
}

export type StorageTier =
  | 'custom'
  | 'keychain'
  | 'secure_store'
  | 'async_storage'
  | 'memory';

interface NativeStorageDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Resolves the highest security storage driver available on the device platform (P0-08):
 * 1. react-native-keychain (Hardware-backed Keystore / Keychain)
 * 2. expo-secure-store (Hardware-backed encrypted storage)
 * 3. @react-native-async-storage/async-storage (Sandboxed platform database)
 * 4. null (MemoryTokenStore fallback)
 */
function resolveNativeStorageDriver(): {
  driver: NativeStorageDriver | null;
  tier: StorageTier;
} {
  // Tier 1: react-native-keychain
  try {
    const keychain = require('react-native-keychain');
    const mod = keychain.default || keychain;
    if (mod && typeof mod.setGenericPassword === 'function') {
      return {
        tier: 'keychain',
        driver: {
          async getItem(key: string): Promise<string | null> {
            const creds = await mod.getGenericPassword({ service: key });
            return creds ? creds.password : null;
          },
          async setItem(key: string, value: string): Promise<void> {
            await mod.setGenericPassword('auth_token', value, { service: key });
          },
          async removeItem(key: string): Promise<void> {
            await mod.resetGenericPassword({ service: key });
          },
        },
      };
    }
  } catch {
    // Keychain package not installed or native module not linked
  }

  // Tier 2: expo-secure-store
  try {
    const secureStore = require('expo-secure-store');
    const mod = secureStore.default || secureStore;
    if (mod && typeof mod.setItemAsync === 'function') {
      return {
        tier: 'secure_store',
        driver: {
          async getItem(key: string): Promise<string | null> {
            return mod.getItemAsync(key);
          },
          async setItem(key: string, value: string): Promise<void> {
            await mod.setItemAsync(key, value);
          },
          async removeItem(key: string): Promise<void> {
            await mod.deleteItemAsync(key);
          },
        },
      };
    }
  } catch {
    // Expo SecureStore not installed
  }

  // Tier 3: @react-native-async-storage/async-storage
  try {
    const asyncStorage = require('@react-native-async-storage/async-storage');
    const mod = asyncStorage.default || asyncStorage;
    if (mod && typeof mod.getItem === 'function') {
      return {
        tier: 'async_storage',
        driver: {
          async getItem(key: string): Promise<string | null> {
            const val = await mod.getItem(key);
            return typeof val === 'string' && val.length > 0 ? val : null;
          },
          async setItem(key: string, value: string): Promise<void> {
            await mod.setItem(key, value);
          },
          async removeItem(key: string): Promise<void> {
            await mod.removeItem(key);
          },
        },
      };
    }
  } catch {
    // AsyncStorage not installed
  }

  return { driver: null, tier: 'memory' };
}

/**
 * Pluggable token store with hardened multi-tier native persistence (P0-08).
 * Attempts secure native platform storage (Keychain / SecureStore) before AsyncStorage,
 * falling back safely to MemoryTokenStore in Jest and node test environments.
 * Strictly guarantees zero token leakage in logs or diagnostics.
 */
export class PluggableTokenStore implements TokenStore {
  private fallback: TokenStore;
  private customStorage: TokenStore | null = null;

  constructor(fallback: TokenStore = new MemoryTokenStore()) {
    this.fallback = fallback;
  }

  /**
   * Allows injecting a custom storage backend (e.g., in unit tests).
   */
  public setCustomStorage(storage: TokenStore | null): void {
    this.customStorage = storage;
  }

  /**
   * Discovers the current active storage tier for diagnostics without exposing token contents.
   */
  public async getStorageTier(): Promise<StorageTier> {
    if (this.customStorage) {
      return 'custom';
    }
    const resolved = resolveNativeStorageDriver();
    return resolved.tier;
  }

  async getToken(): Promise<string | null> {
    if (this.customStorage) {
      return this.customStorage.getToken();
    }
    try {
      const { driver } = resolveNativeStorageDriver();
      if (driver) {
        return await driver.getItem(AUTH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Native storage call failed; fall back cleanly to memory store
    }
    return this.fallback.getToken();
  }

  async setToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (this.customStorage) {
      return this.customStorage.setToken(trimmed);
    }
    try {
      const { driver } = resolveNativeStorageDriver();
      if (driver) {
        await driver.setItem(AUTH_TOKEN_STORAGE_KEY, trimmed);
        return;
      }
    } catch {
      // Native storage write failed; fall back cleanly to memory store
    }
    return this.fallback.setToken(trimmed);
  }

  async clearToken(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clearToken();
    }
    try {
      const { driver } = resolveNativeStorageDriver();
      if (driver) {
        await driver.removeItem(AUTH_TOKEN_STORAGE_KEY);
        return;
      }
    } catch {
      // Native storage clear failed; fall back cleanly to memory store
    }
    return this.fallback.clearToken();
  }
}

export const defaultTokenStore = new PluggableTokenStore();
