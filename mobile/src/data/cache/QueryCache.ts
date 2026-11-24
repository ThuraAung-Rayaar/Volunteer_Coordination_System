/**
 * @format
 *
 * Bounded in-memory query cache with TTL, single-flight requests, tag
 * invalidation, and protection against stale requests repopulating cleared data.
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

interface InFlightEntry<T> {
  promise: Promise<T>;
  tags: string[];
  scope: CacheScope;
  cacheEpoch: number;
}

export class QueryCache {
  private entries: Map<string, CacheEntry<unknown>> = new Map();
  private inFlight: Map<string, InFlightEntry<unknown>> = new Map();
  private cacheEpoch = 0;
  private maxEntries: number;

  constructor(maxEntries: number = 150) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  public get<T>(key: string): GetResult<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Refresh insertion order so an accessed key becomes most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return {
      value: entry.value as T,
      fetchedAt: entry.fetchedAt,
      isFresh: Date.now() - entry.fetchedAt <= entry.ttlMs,
    };
  }

  public set<T>(key: string, value: T, options?: CacheOptions): void {
    // A direct write supersedes any older loader for the same key.
    this.inFlight.delete(key);
    this.store(key, value, options);
  }

  private store<T>(key: string, value: T, options?: CacheOptions): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }

    this.entries.set(key, {
      value,
      fetchedAt: Date.now(),
      ttlMs: options?.ttlMs ?? 30000,
      tags: options?.tags ?? [],
      scope: options?.scope ?? CACHE_SCOPE.PUBLIC,
    });
  }

  public async getOrFetch<T>(
    key: string,
    loader: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    if (options?.forceRefresh) {
      // A forced refresh supersedes an older in-flight request. Its result may
      // still be returned to its original caller, but cannot overwrite the cache.
        this.inFlight.delete(key);
    } else {
      const cached = this.get<T>(key);
      if (cached?.isFresh) return cached.value;

      const ongoing = this.inFlight.get(key);
      if (ongoing) return ongoing.promise as Promise<T>;
    }

    const cacheEpoch = this.cacheEpoch;
    let entry!: InFlightEntry<T>;

    const promise = (async (): Promise<T> => {
      try {
        const result = await loader();
        const stillCurrent =
          this.cacheEpoch === cacheEpoch &&
          this.inFlight.get(key) === entry;

        // Missing results are not cached. A request invalidated while running
        // cannot repopulate a cleared account, tag, prefix, or key.
        if (stillCurrent && result !== null && result !== undefined) {
          this.store(key, result, options);
        }
        return result;
      } finally {
        if (this.inFlight.get(key) === entry) {
          this.inFlight.delete(key);
        }
      }
    })();

    entry = {
      promise,
      tags: options?.tags ?? [],
      scope: options?.scope ?? CACHE_SCOPE.PUBLIC,
      cacheEpoch,
    };
    this.inFlight.set(key, entry);
    return promise;
  }

  public invalidate(key: string): void {
    this.entries.delete(key);
    this.inFlight.delete(key);
  }

  public invalidateTag(tag: string): void {
    const affected = new Set<string>();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.tags.includes(tag)) affected.add(key);
    }
    for (const [key, entry] of this.inFlight.entries()) {
      if (entry.tags.includes(tag)) affected.add(key);
    }
    this.invalidateKeys(affected);
  }

  public invalidatePrefix(prefix: string): void {
    const affected = new Set<string>();
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) affected.add(key);
    }
    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) affected.add(key);
    }
    this.invalidateKeys(affected);
  }

  public clear(): void {
    // Epoch invalidates every request started before this clear, including
    // private requests whose promises settle after logout/account switching.
    this.cacheEpoch += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  public clearScope(scope: CacheScope): void {
    const affected = new Set<string>();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.scope === scope) affected.add(key);
    }
    for (const [key, entry] of this.inFlight.entries()) {
      if (entry.scope === scope) affected.add(key);
    }
    this.invalidateKeys(affected);
  }

  public clearAccountScope(): void {
    this.clearScope(CACHE_SCOPE.ACCOUNT);
  }

  private invalidateKeys(keys: Set<string>): void {
    for (const key of keys) {
      this.entries.delete(key);
        this.inFlight.delete(key);
    }
  }

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
