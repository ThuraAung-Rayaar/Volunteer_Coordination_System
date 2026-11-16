/**
 * @format
 */

import { ThemeMode } from './tokens';

/**
 * Storage key strictly isolated to display appearance preference.
 * Auth tokens, user credentials, and session state must NEVER be persisted here.
 */
export const THEME_STORAGE_KEY = '@volunteer_mgmt:theme_preference';

export interface ThemeStorage {
  getThemeMode(): Promise<ThemeMode | null>;
  setThemeMode(mode: ThemeMode): Promise<void>;
  clearThemeMode(): Promise<void>;
}

export class MemoryThemeStorage implements ThemeStorage {
  private preference: ThemeMode | null = null;

  constructor(initialPreference: ThemeMode | null = null) {
    this.preference = initialPreference;
  }

  async getThemeMode(): Promise<ThemeMode | null> {
    return this.preference;
  }

  async setThemeMode(mode: ThemeMode): Promise<void> {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      this.preference = mode;
    }
  }

  async clearThemeMode(): Promise<void> {
    this.preference = null;
  }
}

/**
 * Pluggable theme storage singleton.
 * Persists ONLY theme preference (never auth tokens or credentials).
 */
export class PluggableThemeStorage implements ThemeStorage {
  private fallback: ThemeStorage;
  private customStorage: ThemeStorage | null = null;

  constructor(fallback: ThemeStorage = new MemoryThemeStorage()) {
    this.fallback = fallback;
  }

  public setCustomStorage(storage: ThemeStorage | null): void {
    this.customStorage = storage;
  }

  async getThemeMode(): Promise<ThemeMode | null> {
    if (this.customStorage) {
      return this.customStorage.getThemeMode();
    }
    try {
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.getItem === 'function') {
        const val = await storageModule.getItem(THEME_STORAGE_KEY);
        if (val === 'light' || val === 'dark' || val === 'system') {
          return val;
        }
      }
    } catch {
      // Native package not installed; fallback to memory storage
    }
    return this.fallback.getThemeMode();
  }

  async setThemeMode(mode: ThemeMode): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.setThemeMode(mode);
    }
    try {
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.setItem === 'function') {
        await storageModule.setItem(THEME_STORAGE_KEY, mode);
        return;
      }
    } catch {
      // Native package not installed; fallback to memory storage
    }
    return this.fallback.setThemeMode(mode);
  }

  async clearThemeMode(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clearThemeMode();
    }
    try {
      const asyncStorage = require('@react-native-async-storage/async-storage');
      const storageModule = asyncStorage.default || asyncStorage;
      if (storageModule && typeof storageModule.removeItem === 'function') {
        await storageModule.removeItem(THEME_STORAGE_KEY);
        return;
      }
    } catch {
      // Fallback
    }
    return this.fallback.clearThemeMode();
  }
}

export const defaultThemeStorage = new PluggableThemeStorage();
