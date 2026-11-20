/**
 * @format
 */

/**
 * Storage key strictly isolated to authentication token storage.
 * Isolated from theme preference (@volunteer_mgmt:theme_preference).
 */
export const AUTH_TOKEN_STORAGE_KEY = '@volunteer_mgmt:auth_token';

/**
 * Controlled session storage error class for fail-closed storage operations.
 */
export class SessionStorageError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'STORAGE_UNAVAILABLE') {
    super(message);
    this.name = 'SessionStorageError';
    this.code = code;
    Object.setPrototypeOf(this, SessionStorageError.prototype);
  }
}

export type StorageTier = 'keychain' | 'custom' | 'memory';

export interface StorageCapabilityStatus {
  tier: StorageTier;
  isSecure: boolean;
  isAvailable: boolean;
}

export interface TokenStore {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

/**
 * In-memory token store strictly for explicit injection in tests and mock environments.
 * Must NEVER be used as a silent fallback in production HTTP mode.
 */
export class MemoryTokenStore implements TokenStore {
  private token: string | null = null;

  constructor(initialToken: string | null = null) {
    this.token = initialToken ? initialToken.trim() : null;
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

/**
 * Declared secure token store utilizing react-native-keychain (Hardware-backed Keystore / Keychain).
 * Fails closed with SessionStorageError if native secure storage is unavailable or fails.
 * Zero AsyncStorage or silent in-memory fallback in production mode.
 */
export class KeychainTokenStore implements TokenStore {
  private serviceName: string;

  constructor(serviceName: string = AUTH_TOKEN_STORAGE_KEY) {
    this.serviceName = serviceName;
  }

  private getKeychain() {
    try {
      // Dynamic require ensures compatibility across environments and Jest mocking
      const keychain = require('react-native-keychain');
      return keychain.default || keychain;
    } catch {
      return null;
    }
  }

  public isAvailable(): boolean {
    const kc = this.getKeychain();
    return Boolean(kc && typeof kc.setGenericPassword === 'function');
  }

  async getToken(): Promise<string | null> {
    const kc = this.getKeychain();
    if (!kc || typeof kc.getGenericPassword !== 'function') {
      throw new SessionStorageError(
        'Secure token storage (Keychain/Keystore) is unavailable on this device.',
        'SECURE_STORAGE_UNAVAILABLE',
      );
    }
    try {
      const creds = await kc.getGenericPassword({ service: this.serviceName });
      if (!creds || typeof creds !== 'object') {
        return null;
      }
      return creds.password || null;
    } catch (err) {
      if (err instanceof SessionStorageError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new SessionStorageError(
        `Failed to retrieve authentication token from secure storage: ${msg}`,
        'SECURE_STORAGE_READ_ERROR',
      );
    }
  }

  async setToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      await this.clearToken();
      return;
    }
    const kc = this.getKeychain();
    if (!kc || typeof kc.setGenericPassword !== 'function') {
      throw new SessionStorageError(
        'Secure token storage (Keychain/Keystore) is unavailable on this device.',
        'SECURE_STORAGE_UNAVAILABLE',
      );
    }
    try {
      const result = await kc.setGenericPassword('auth_token', trimmed, {
        service: this.serviceName,
      });
      if (result === false) {
        throw new SessionStorageError(
          'Secure storage driver rejected credential persistence.',
          'SECURE_STORAGE_WRITE_REJECTED',
        );
      }
    } catch (err) {
      if (err instanceof SessionStorageError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new SessionStorageError(
        `Failed to persist authentication token to secure storage: ${msg}`,
        'SECURE_STORAGE_WRITE_ERROR',
      );
    }
  }

  async clearToken(): Promise<void> {
    const kc = this.getKeychain();
    if (!kc || typeof kc.resetGenericPassword !== 'function') {
      throw new SessionStorageError(
        'Secure token storage (Keychain/Keystore) is unavailable on this device.',
        'SECURE_STORAGE_UNAVAILABLE',
      );
    }
    try {
      await kc.resetGenericPassword({ service: this.serviceName });
    } catch (err) {
      if (err instanceof SessionStorageError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new SessionStorageError(
        `Failed to clear authentication token from secure storage: ${msg}`,
        'SECURE_STORAGE_CLEAR_ERROR',
      );
    }
  }
}

/**
 * Pluggable token store adapter allowing explicitly injected custom storage (e.g. MemoryTokenStore in tests)
 * while defaulting strictly to KeychainTokenStore in production.
 */
export class PluggableTokenStore implements TokenStore {
  private fallback: TokenStore | null = null;
  private customStorage: TokenStore | null = null;
  private primary: KeychainTokenStore;

  constructor(fallback: TokenStore | null = null) {
    this.fallback = fallback;
    this.primary = new KeychainTokenStore();
  }

  public setCustomStorage(storage: TokenStore | null): void {
    this.customStorage = storage;
  }

  public async getStorageTier(): Promise<StorageTier> {
    if (this.customStorage) {
      return 'custom';
    }
    if (this.fallback) {
      return this.fallback instanceof MemoryTokenStore ? 'memory' : 'custom';
    }
    return 'keychain';
  }

  async getToken(): Promise<string | null> {
    if (this.customStorage) {
      return this.customStorage.getToken();
    }
    if (this.fallback) {
      return this.fallback.getToken();
    }
    return this.primary.getToken();
  }

  async setToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (this.customStorage) {
      return this.customStorage.setToken(trimmed);
    }
    if (this.fallback) {
      return this.fallback.setToken(trimmed);
    }
    return this.primary.setToken(trimmed);
  }

  async clearToken(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clearToken();
    }
    if (this.fallback) {
      return this.fallback.clearToken();
    }
    return this.primary.clearToken();
  }
}

/**
 * Exposes non-sensitive storage capability status without ever reading, exposing, or logging token values.
 */
export function getStorageCapabilityStatus(
  store?: TokenStore,
): StorageCapabilityStatus {
  if (store instanceof MemoryTokenStore) {
    return {
      tier: 'memory',
      isSecure: false,
      isAvailable: true,
    };
  }
  const primary = new KeychainTokenStore();
  return {
    tier: 'keychain',
    isSecure: true,
    isAvailable: primary.isAvailable(),
  };
}

/**
 * Default token store utilizing hardware-backed Keychain / Keystore by default,
 * while allowing injected test storage in mock and unit test suites.
 */
export const defaultTokenStore = new PluggableTokenStore();
