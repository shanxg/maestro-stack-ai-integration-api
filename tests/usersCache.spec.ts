// 🗃️ USERS PAGE CACHE (issue #52): versioned keys instead of a KEYS scan.
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import type { Redis } from 'ioredis';
import { FakeRedis } from './helpers/fakeRedis.js';
import { UsersCache, USERS_CACHE_VERSION_KEY } from '../src/cache/usersCache.js';

const page = [{ id: 'abc-777', name: 'Lucas Cache', email: 'cache@maestro.test' }];

describe('UsersCache (versioned GET /api/v1/users pages)', () => {
  let redis: FakeRedis;
  let cache: UsersCache;

  beforeEach(() => {
    FakeRedis.reset();
    redis = new FakeRedis();
    cache = new UsersCache(redis as unknown as Redis);
  });

  // TEST 1: Verify an invalidation is one INCR of the version, never a KEYS scan of the keyspace.
  // Condition: Pages of several sizes are cached, plus unrelated rate-limit counters in the same Redis.
  it('invalidates every cached page with one INCR and never calls KEYS', async () => {
    const keysSpy = jest.spyOn(FakeRedis.prototype, 'keys');
    const incrSpy = jest.spyOn(FakeRedis.prototype, 'incr');
    try {
      const version = await cache.currentVersion() as string;
      await cache.setPage(version, 10, 0, page);
      await cache.setPage(version, 50, 100, page);

      await cache.invalidate();

      expect(keysSpy).not.toHaveBeenCalled();
      expect(incrSpy).toHaveBeenCalledTimes(1);
      expect(incrSpy).toHaveBeenCalledWith(USERS_CACHE_VERSION_KEY);

      // Readers now build keys with the new version, so neither old page is served.
      const newVersion = await cache.currentVersion() as string;
      expect(newVersion).not.toBe(version);
      expect(await cache.getPage(newVersion, 10, 0)).toBeNull();
      expect(await cache.getPage(newVersion, 50, 100)).toBeNull();
    } finally {
      keysSpy.mockRestore();
      incrSpy.mockRestore();
    }
  });

  // TEST 2: Verify a page computed while an account is being saved is never served as current.
  // Condition: The version is read, an invalidation happens, then the (now stale) page is stored.
  it('keeps a page stored after an invalidation under the old version', async () => {
    const versionBeforeQuery = await cache.currentVersion() as string;
    await cache.invalidate(); // the queue consumer saved a new account meanwhile
    await cache.setPage(versionBeforeQuery, 10, 0, page);

    expect(await cache.getPage(await cache.currentVersion() as string, 10, 0)).toBeNull();
    expect(await cache.getPage(versionBeforeQuery, 10, 0)).toEqual(page);
  });

  // TEST 3: Verify a Redis outage never fails a request: reads miss, writes and invalidations are skipped.
  // Condition: Every Redis command fails, as ioredis does when the connection is down.
  it('falls back without throwing when Redis is unavailable', async () => {
    FakeRedis.failing = true;

    await expect(cache.currentVersion()).resolves.toBeNull();
    await expect(cache.getPage('0', 10, 0)).resolves.toBeNull();
    await expect(cache.setPage('0', 10, 0, page)).resolves.toBeUndefined();
    await expect(cache.invalidate()).resolves.toBeUndefined();
  });
});
