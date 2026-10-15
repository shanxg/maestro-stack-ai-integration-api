// 1. IMPORTS: The Store contract and the in-memory store from express-rate-limit, and the Redis client type.
import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { type Redis } from 'ioredis';

/**
 * 🧮 SHARED RATE-LIMIT STORE (CWE-770 / OWASP API4:2023):
 * Keeps the express-rate-limit counters in Redis, so every API replica counts the same hits.
 * With in-process counters, the two replicas behind the Kubernetes Service each allowed the
 * full limit, so a client could send twice as many requests (and login attempts) as configured.
 *
 * RESILIENCE: If Redis cannot be reached, the store counts in this process's memory instead.
 * The limits then apply per replica, as before, and no request fails because of the outage.
 */
export class RedisRateLimitStore implements Store {
  // Each limiter needs its own prefix; otherwise the global and login limiters would share keys.
  readonly prefix: string;

  // Counters for this process only, used while Redis is unavailable.
  private readonly fallback = new MemoryStore();

  // Copied from the limiter in init(); it is also the lifetime of each Redis counter.
  private windowMs = 60_000;

  // Used to log an outage once, and the recovery once, instead of on every request.
  private redisAvailable = true;

  constructor(private readonly client: Redis, prefix: string) {
    this.prefix = prefix;
  }

  // Called once by express-rate-limit with the limiter's options.
  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  // Count one hit for the client and return the total and the end of the current window.
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redisKey = `${this.prefix}${key}`;

    try {
      // One MULTI/EXEC transaction: create the counter with the window as its expiry
      // (NX leaves an existing counter alone), add this hit, and read the time left.
      // INCR keeps the expiry, so the window does not restart on every hit.
      const results = await this.client.multi()
        .set(redisKey, 0, 'PX', this.windowMs, 'NX')
        .incr(redisKey)
        .pttl(redisKey)
        .exec();

      if (!results || results.some(([error]) => error)) {
        throw new Error('Redis rejected the rate-limit transaction.');
      }

      const totalHits = Number(results[1]?.[1]);
      let timeLeft = Number(results[2]?.[1]);

      // A counter without an expiry would block the client forever, so give it one.
      if (!(timeLeft > 0)) {
        await this.client.pexpire(redisKey, this.windowMs);
        timeLeft = this.windowMs;
      }

      this.reportRedis(true);
      return { totalHits, resetTime: new Date(Date.now() + timeLeft) };
    } catch (error) {
      this.reportRedis(false, error);
      return this.fallback.increment(key);
    }
  }

  // Remove one hit (used by the skipSuccessfulRequests and skipFailedRequests options).
  async decrement(key: string): Promise<void> {
    try {
      await this.client.decr(`${this.prefix}${key}`);
    } catch (error) {
      this.reportRedis(false, error);
      await this.fallback.decrement(key);
    }
  }

  // Forget a client's hits in Redis and in the fallback counters.
  async resetKey(key: string): Promise<void> {
    try {
      await this.client.del(`${this.prefix}${key}`);
    } catch (error) {
      this.reportRedis(false, error);
    }
    await this.fallback.resetKey(key);
  }

  // Log only when Redis changes between available and unavailable.
  private reportRedis(available: boolean, error?: unknown): void {
    if (available === this.redisAvailable) {
      return;
    }
    this.redisAvailable = available;

    if (available) {
      console.log(`✅ [RateLimit] Redis is reachable again; '${this.prefix}' counters are shared across replicas.`);
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ [RateLimit] Redis unavailable (${reason}); '${this.prefix}' counters fall back to this process's memory.`);
    }
  }
}
