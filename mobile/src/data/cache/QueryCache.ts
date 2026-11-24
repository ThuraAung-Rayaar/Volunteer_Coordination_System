/**
 * @format
 * Bounded in-memory Query Cache with TTL, single-flight deduplication,
 * tag-based invalidation, and account scope isolation.
 */

import { CACHE_SCOPE, CacheScope } from './cachePolicy';

export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  ttlMs: number;
  tags: string[];
  scope: CacheScope;
}

export interface GetResult<T> {
  value: T;
  fetchedAt: number;
  isFresh: boolean;
}

export interface CacheOptions {
  ttlMs?: number;
  tags?: string[];
  scope?: CacheScope;
  forceRefresh?: boolean;
}

export class QueryCache {
  private entries: Map<string, CacheEntry<any>> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private maxEntries: number;

  constructor(maxEntries: number = 150) {
    this.maxEntries = maxEntries;
  }

  /**
   * Reads a cached item. Returns undefined if not present.
   */
  public get<T>(key: string): GetResult<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Refresh insertion order so accessed key becomes most recently used
    this.entries.delete(key);
    this.entries.set(key, entry);

    const now = Date.now();
    const isFresh = now - entry.fetchedAt <= entry.ttlMs;

    return {
      value: entry.value as T,
      fetchedAt: entry.fetchedAt,
      isFresh,
    };
  }

  /**
   * Sets a value directly in the cache. Evicts LRU item if capacity is exceeded.
   */
  public set<T>(key: string, value: T, options?: CacheOptions): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      // Evict oldest entry (first key in Map insertion order)
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, {
      value,
      fetchedAt: Date.now(),
      ttlMs: options?.ttlMs ?? 30000,
      tags: options?.tags ?? [],
      scope: options?.scope ?? CACHE_SCOPE.PUBLIC,
    });
  }

  /**
   * Gets a cached item if fresh; otherwise fetches via loader with deduplication.
   * If forceRefresh is true, bypasses the fresh cache check.
   */
  public async getOrFetch<T>(
    key: string,
    loader: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    if (!options?.forceRefresh) {
      const cached = this.get<T>(key);
      if (cached && cached.isFresh) {
        return cached.value;
      }
    }

    // Single-flight deduplication: reuse ongoing promise for this exact key
    const ongoing = this.inFlight.get(key);
    if (ongoing) {
      return ongoing as Promise<T>;
    }

    const fetchPromise = (async () => {
      try {
        const result = await loader();
        // Do not cache null/undefined if considered an error or missing data
        this.set(key, result, options);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Invalidates a single cache key.
   */
  public invalidate(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Invalidates all cache entries carrying the specified tag.
   */
  public invalidateTag(tag: string): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.tags.includes(tag)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Invalidates all cache entries whose key starts with the given prefix.
   */
  public invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Clears all cache entries across all scopes.
   */
  public clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /**
   * Clears only entries matching the specified scope (e.g. 'account').
   */
  public clearScope(scope: CacheScope): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.scope === scope) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Convenience helper to wipe all private/account-scoped cached data on logout or 401.
   */
  public clearAccountScope(): void {
    this.clearScope(CACHE_SCOPE.ACCOUNT);
  }

  /**
   * Inspection helper for test assertions.
   */
  public get size(): number {
    return this.entries.size;
  }

  public clearAll(): void {
    this.clear();
  }

  public has(key: string): boolean {
    return this.entries.has(key);
  }
}

export const queryCache = new QueryCache();
