// 1. IMPORTS: Jest utilities, the store under test and the in-memory Redis stand-in.
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import type { Options } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { RedisRateLimitStore } from '../src/middlewares/redisRateLimitStore.js';
import { FakeRedis } from './helpers/fakeRedis.js';
import { logger } from '../src/logger.js'; // The store logs through the shared logger (issue #53)

// The store only reads windowMs from the limiter options.
const WINDOW_MS = 60_000;
const limiterOptions = { windowMs: WINDOW_MS } as Options;

// Build a store the way app.ts does, each with its own client, as on separate replicas.
function createStore(prefix = 'rl:test:'): RedisRateLimitStore {
  const store = new RedisRateLimitStore(new FakeRedis() as unknown as Redis, prefix);
  store.init(limiterOptions);
  return store;
}

describe('RedisRateLimitStore (rate-limit counters shared through Redis)', () => {
  // Start every test with an empty keyspace and Redis available.
  beforeEach(() => {
    FakeRedis.reset();
  });

  // TEST 1: Verify that two replicas count the same hits (issue #65).
  // Condition: Two stores with separate clients and the same prefix increment the same client key.
  it('shares one counter between stores on different replicas', async () => {
    const replicaA = createStore();
    const replicaB = createStore();

    expect((await replicaA.increment('203.0.113.7')).totalHits).toBe(1);
    expect((await replicaB.increment('203.0.113.7')).totalHits).toBe(2);
    expect((await replicaA.increment('203.0.113.7')).totalHits).toBe(3);
  });

  // TEST 2: Verify the counter expires with the limiter window and later hits do not restart it.
  // Condition: The first hit creates the key with the window as its expiry.
  it('creates the counter with the limiter window as its expiry', async () => {
    const store = createStore();

    const first = await store.increment('203.0.113.7');
    const second = await store.increment('203.0.113.7');

    expect(first.resetTime!.getTime() - Date.now()).toBeGreaterThan(WINDOW_MS - 1_000);
    expect(first.resetTime!.getTime() - Date.now()).toBeLessThanOrEqual(WINDOW_MS);
    expect(Math.abs(second.resetTime!.getTime() - first.resetTime!.getTime())).toBeLessThan(1_000);
    expect(FakeRedis.data.get('rl:test:203.0.113.7')?.expiresAt).not.toBeNull();
  });

  // TEST 3: Verify each limiter has its own keys, so global hits never count as login attempts.
  // Condition: Two stores with different prefixes increment the same client key.
  it('keeps limiters with different prefixes apart', async () => {
    const globalStore = createStore('rl:global:');
    const loginStore = createStore('rl:login:');

    await globalStore.increment('203.0.113.7');
    await globalStore.increment('203.0.113.7');

    expect((await loginStore.increment('203.0.113.7')).totalHits).toBe(1);
  });

  // TEST 4: Verify a Redis outage never disables the limit or fails the request.
  // Condition: Every Redis command fails; the store must keep counting in memory and log once.
  it('falls back to in-memory counting and logs once when Redis is unavailable', async () => {
    // The store warns through the shared logger (issue #53).
    const warnSpy = jest.spyOn(logger, 'warn');
    const store = createStore();
    FakeRedis.failing = true;

    try {
      expect((await store.increment('203.0.113.7')).totalHits).toBe(1);
      expect((await store.increment('203.0.113.7')).totalHits).toBe(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // TEST 5: Verify a counter left without an expiry gets one instead of blocking the client forever.
  // Condition: The key already exists with no expiry when the next hit arrives.
  it('adds the window expiry to a counter that has none', async () => {
    const store = createStore();
    FakeRedis.data.set('rl:test:203.0.113.7', { value: 4, expiresAt: null });

    const result = await store.increment('203.0.113.7');

    expect(result.totalHits).toBe(5);
    expect(FakeRedis.data.get('rl:test:203.0.113.7')?.expiresAt).not.toBeNull();
  });
});
