/**
 * @format
 */

import { QueryCache } from '../QueryCache';
import { CACHE_SCOPE, CACHE_TTL } from '../cachePolicy';

describe('QueryCache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache(5); // small size for testing LRU
  });

  afterEach(() => {
    cache.clearAll();
  });

  it('caches values and returns cached value on subsequent getOrFetch call', async () => {
    const fetcher = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

    const first = await cache.getOrFetch('key1', fetcher, {
      ttlMs: 5000,
      scope: CACHE_SCOPE.PUBLIC,
    });
    expect(first).toEqual({ id: 1, name: 'Test' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await cache.getOrFetch('key1', fetcher, {
      ttlMs: 5000,
      scope: CACHE_SCOPE.PUBLIC,
    });
    expect(second).toEqual({ id: 1, name: 'Test' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches when expired by TTL', async () => {
    let callCount = 0;
    const fetcher = jest.fn().mockImplementation(async () => {
      callCount += 1;
      return { count: callCount };
    });

    // TTL 50ms
    const first = await cache.getOrFetch('key-ttl', fetcher, {
      ttlMs: 50,
      scope: CACHE_SCOPE.PUBLIC,
    });
    expect(first).toEqual({ count: 1 });

    // Wait 70ms for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 70));

    const second = await cache.getOrFetch('key-ttl', fetcher, {
      ttlMs: 50,
      scope: CACHE_SCOPE.PUBLIC,
    });
    expect(second).toEqual({ count: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh bypasses cached value and fetches fresh data', async () => {
    let counter = 0;
    const fetcher = jest.fn().mockImplementation(async () => ++counter);

    await cache.getOrFetch('key-force', fetcher, { ttlMs: 10000 });
    expect(counter).toBe(1);

    const fresh = await cache.getOrFetch('key-force', fetcher, {
      ttlMs: 10000,
      forceRefresh: true,
    });
    expect(fresh).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent in-flight requests for the same key (single-flight)', async () => {
    let callCount = 0;
    const fetcher = jest.fn().mockImplementation(async () => {
      callCount += 1;
      await new Promise(r => setTimeout(r, 20));
      return { res: callCount };
    });

    const [res1, res2, res3] = await Promise.all([
      cache.getOrFetch('inflight-key', fetcher, { ttlMs: 5000 }),
      cache.getOrFetch('inflight-key', fetcher, { ttlMs: 5000 }),
      cache.getOrFetch('inflight-key', fetcher, { ttlMs: 5000 }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(res1).toEqual({ res: 1 });
    expect(res2).toEqual({ res: 1 });
    expect(res3).toEqual({ res: 1 });
  });

  it('invalidates entries by tag correctly', async () => {
    await cache.getOrFetch('event:1', async () => 'data1', {
      tags: ['events', 'event:1'],
    });
    await cache.getOrFetch('event:2', async () => 'data2', {
      tags: ['events', 'event:2'],
    });
    await cache.getOrFetch('user:1', async () => 'user1', {
      tags: ['users'],
    });

    expect(cache.size).toBe(3);

    cache.invalidateTag('event:1');
    expect(cache.has('event:1')).toBe(false);
    expect(cache.has('event:2')).toBe(true);
    expect(cache.has('user:1')).toBe(true);

    cache.invalidateTag('events');
    expect(cache.has('event:2')).toBe(false);
    expect(cache.has('user:1')).toBe(true);
  });

  it('invalidates entries by key prefix', async () => {
    await cache.getOrFetch('coord:event:1', async () => 'd1');
    await cache.getOrFetch('coord:event:2', async () => 'd2');
    await cache.getOrFetch('volunteer:event:1', async () => 'd3');

    cache.invalidatePrefix('coord:');
    expect(cache.has('coord:event:1')).toBe(false);
    expect(cache.has('coord:event:2')).toBe(false);
    expect(cache.has('volunteer:event:1')).toBe(true);
  });

  it('clearAccountScope only clears ACCOUNT scoped items and retains PUBLIC items', async () => {
    await cache.getOrFetch('public-events', async () => 'pub', {
      scope: CACHE_SCOPE.PUBLIC,
    });
    await cache.getOrFetch('my-applications', async () => 'priv', {
      scope: CACHE_SCOPE.ACCOUNT,
    });

    expect(cache.has('public-events')).toBe(true);
    expect(cache.has('my-applications')).toBe(true);

    cache.clearAccountScope();

    expect(cache.has('public-events')).toBe(true);
    expect(cache.has('my-applications')).toBe(false);
  });

  it('evicts oldest entries when capacity limit is reached (LRU)', async () => {
    const smallCache = new QueryCache(3);

    await smallCache.getOrFetch('k1', async () => 'v1');
    await smallCache.getOrFetch('k2', async () => 'v2');
    await smallCache.getOrFetch('k3', async () => 'v3');
    expect(smallCache.size).toBe(3);

    // Access k1 to make k2 the least recently used
    await smallCache.getOrFetch('k1', async () => 'v1');

    // Add k4 -> should evict k2
    await smallCache.getOrFetch('k4', async () => 'v4');
    expect(smallCache.size).toBe(3);
    expect(smallCache.has('k1')).toBe(true);
    expect(smallCache.has('k2')).toBe(false);
    expect(smallCache.has('k3')).toBe(true);
    expect(smallCache.has('k4')).toBe(true);
  });
  it('does not let an invalidated in-flight request repopulate the cache', async () => {
    let resolveLoader!: (value: string) => void;
    const loader = jest.fn(
      () => new Promise<string>(resolve => { resolveLoader = resolve; }),
    );

    const pending = cache.getOrFetch('stale-key', loader, {
      ttlMs: 5000,
      scope: CACHE_SCOPE.ACCOUNT,
      tags: ['private:profile'],
    });
    cache.invalidateTag('private:profile');
    resolveLoader('old-account-data');
    await pending;

    expect(cache.has('stale-key')).toBe(false);
  });

  it('does not let a cleared account request repopulate private data', async () => {
    let resolveLoader!: (value: string) => void;
    const pending = cache.getOrFetch(
      'private:profile',
      () => new Promise<string>(resolve => { resolveLoader = resolve; }),
      { scope: CACHE_SCOPE.ACCOUNT },
    );

    cache.clearAccountScope();
    resolveLoader('previous-user');
    await pending;

    expect(cache.has('private:profile')).toBe(false);
  });

});
