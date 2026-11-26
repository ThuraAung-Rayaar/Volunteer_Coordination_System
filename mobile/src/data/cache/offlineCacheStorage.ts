/**
 * @format
 */

import type { UserProfileSnapshot } from '../../domain/models';
import type { CacheEntry } from './QueryCache';

export const OFFLINE_CACHE_STORAGE_KEY = '@volunteer_mgmt:offline_cache_v1';

export interface OfflineCacheSnapshotPayload {
  version: 1;
  savedAt: number;
  lastUser: UserProfileSnapshot | null;
  entries: Array<[string, CacheEntry<unknown>]>;
}

export interface OfflineCacheStorage {
  loadSnapshot(): Promise<OfflineCacheSnapshotPayload | null>;
  saveSnapshot(payload: OfflineCacheSnapshotPayload): Promise<void>;
  clearSnapshot(): Promise<void>;
}

export class MemoryOfflineCacheStorage implements OfflineCacheStorage {
  private payload: OfflineCacheSnapshotPayload | null = null;

  async loadSnapshot(): Promise<OfflineCacheSnapshotPayload | null> {
    return this.payload;
  }

  async saveSnapshot(payload: OfflineCacheSnapshotPayload): Promise<void> {
    this.payload = payload;
  }

  async clearSnapshot(): Promise<void> {
    this.payload = null;
  }
}

/**
 * Pluggable offline cache persistence adapter.
 * Uses AsyncStorage if present in the native runtime, falling back cleanly
 * to an in-memory snapshot store so zero extra native dependencies are required.
 */
export class PluggableOfflineCacheStorage implements OfflineCacheStorage {
  private fallback: OfflineCacheStorage;
  private customStorage: OfflineCacheStorage | null = null;

  constructor(fallback: OfflineCacheStorage = new MemoryOfflineCacheStorage()) {
    this.fallback = fallback;
  }

  public setCustomStorage(storage: OfflineCacheStorage | null): void {
    this.customStorage = storage;
  }

  private getAsyncStorage(): {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  } | null {
    try {
      const mod = require('@react-native-async-storage/async-storage');
      const asyncStorage = mod?.default || mod;
      if (
        asyncStorage &&
        typeof asyncStorage.getItem === 'function' &&
        typeof asyncStorage.setItem === 'function'
      ) {
        return asyncStorage;
      }
    } catch {
      // Native package not installed; fallback to memory storage
    }
    return null;
  }

  async loadSnapshot(): Promise<OfflineCacheSnapshotPayload | null> {
    if (this.customStorage) {
      return this.customStorage.loadSnapshot();
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        const raw = await asyncStorage.getItem(OFFLINE_CACHE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as OfflineCacheSnapshotPayload;
          if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) {
            return parsed;
          }
        }
      } catch {
        // Ignore corrupted cache payload
      }
    }
    return this.fallback.loadSnapshot();
  }

  async saveSnapshot(payload: OfflineCacheSnapshotPayload): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.saveSnapshot(payload);
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.setItem(
          OFFLINE_CACHE_STORAGE_KEY,
          JSON.stringify(payload),
        );
      } catch {
        // Ignore persistence quota errors
      }
    }
    return this.fallback.saveSnapshot(payload);
  }

  async clearSnapshot(): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.clearSnapshot();
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.removeItem(OFFLINE_CACHE_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    return this.fallback.clearSnapshot();
  }
}

export const defaultOfflineCacheStorage = new PluggableOfflineCacheStorage();
