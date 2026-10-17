// 1. IMPORTS: The Redis client type, the cache lifetime and the public user view.
import { type Redis } from 'ioredis';
import { settings } from '../config.js';
import { type UserResponse } from '../dtos/userResponse.js';
import { logger } from '../logger.js';

/**
 * 🗃️ USERS PAGE CACHE WITH A VERSION COUNTER (issue #52):
 * GET /api/v1/users caches each page (limit/offset combination) in Redis for settings.usersCacheTtlSeconds.
 *
 * INVALIDATION WITHOUT KEYS: before, every registration ran redis.keys('users:*') and deleted the
 * matches. KEYS walks the WHOLE keyspace in one blocking command (Redis runs commands one at a
 * time), and that keyspace also holds the rate-limit counters of every client IP, so one public
 * request could stall Redis for every replica. Now each page key carries a version number:
 *
 *   users:cache-version          -> "7"
 *   users:v7:limit=10:offset=0   -> "[...]"
 *
 * Invalidating is one INCR of the version (O(1)). Readers then build keys with the new version and
 * miss; the old pages are never read again and expire on their own when their TTL ends.
 * A page is written under the version read BEFORE the database query, so a page computed while an
 * invalidation happens lands under the old version and can never be served as current.
 *
 * BEST EFFORT: the cache only saves database reads. If Redis fails, reads fall back to PostgreSQL
 * and writes and invalidations are skipped with a warning; a request never fails because of it.
 * The worst case is a page up to settings.usersCacheTtlSeconds old (eventual consistency).
 */
export const USERS_CACHE_VERSION_KEY = 'users:cache-version';

export class UsersCache {
  // The client is injected (src/app.ts creates it with the shared connection settings), so tests
  // can pass the in-memory FakeRedis.
  constructor(private readonly redis: Redis) {}

  // The current version; '0' until the first invalidation creates the counter.
  async currentVersion(): Promise<string | null> {
    try {
      return (await this.redis.get(USERS_CACHE_VERSION_KEY)) ?? '0';
    } catch (error) {
      this.warn('read the cache version', error);
      return null; // null = Redis unavailable: skip the cache for this request
    }
  }

  // The key of one page under one version, for example users:v7:limit=10:offset=0.
  static pageKey(version: string, limit: number, offset: number): string {
    return `users:v${version}:limit=${limit}:offset=${offset}`;
  }

  // A cached page, or null on a miss or when Redis is unavailable.
  async getPage(version: string, limit: number, offset: number): Promise<UserResponse[] | null> {
    try {
      const cached = await this.redis.get(UsersCache.pageKey(version, limit, offset));
      return cached ? (JSON.parse(cached) as UserResponse[]) : null;
    } catch (error) {
      this.warn('read a users page', error);
      return null;
    }
  }

  // Store a page (already mapped to the public view) under the version read before the query.
  async setPage(version: string, limit: number, offset: number, users: UserResponse[]): Promise<void> {
    try {
      await this.redis.set(UsersCache.pageKey(version, limit, offset), JSON.stringify(users), 'EX', settings.usersCacheTtlSeconds);
    } catch (error) {
      this.warn('store a users page', error);
    }
  }

  // Make every cached page stale at once: one INCR, whatever the number of cached pages.
  async invalidate(): Promise<void> {
    try {
      await this.redis.incr(USERS_CACHE_VERSION_KEY);
    } catch (error) {
      this.warn('invalidate the users cache', error);
    }
  }

  // Cache failures are logged with the reason only; the request carries on without the cache.
  private warn(action: string, error: unknown): void {
    logger.warn(
      { component: 'cache', reason: error instanceof Error ? error.message : String(error) },
      `Could not ${action}; continuing without the cache`
    );
  }
}
