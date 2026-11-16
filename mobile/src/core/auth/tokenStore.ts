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

/**
 * Pluggable token store.
 * Attempts to use `@react-native-async-storage/async-storage` when available;
 * falls back to in-memory store seamlessly.
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

  async getToken(): Promise<string | null> {
    if (this.customStorage) {
      return this.customStorage.getToken();
    }
    try {
      // Dynamic try-require pattern matching themeStorage.ts
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.getItem === 'function') {
        const val = await storageModule.getItem(AUTH_TOKEN_STORAGE_KEY);
        return typeof val === 'string' && val.length > 0 ? val : null;
      }
    } catch {
      // Package not installed or unavailable; use memory fallback
    }
    return this.fallback.getToken();
  }

  async setToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (this.customStorage) {
      return this.customStorage.setToken(trimmed);
    }
    try {
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.setItem === 'function') {
        await storageModule.setItem(AUTH_TOKEN_STORAGE_KEY, trimmed);
        return;
      }
    } catch {
      // Fallback to memory
    }
    return this.fallback.setToken(trimmed);
  }

  async clearToken(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clearToken();
    }
    try {
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.removeItem === 'function') {
        await storageModule.removeItem(AUTH_TOKEN_STORAGE_KEY);
        return;
      }
    } catch {
      // Fallback to memory
    }
    return this.fallback.clearToken();
  }
}

export const defaultTokenStore = new PluggableTokenStore();
