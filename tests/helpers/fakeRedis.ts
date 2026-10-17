// 🧪 FAKE REDIS: An in-memory stand-in for the ioredis client, so the suites run without a Redis server.
// Every instance shares one keyspace, the way the API replicas share one Redis server.
// Counters (rate limits, the users cache version) hold numbers; cached pages hold JSON text.
type Entry = { value: number | string; expiresAt: number | null };

export class FakeRedis {
  // The shared keyspace and the outage switch, reset between tests with FakeRedis.reset().
  static readonly data = new Map<string, Entry>();
  static failing = false;

  static reset(): void {
    FakeRedis.data.clear();
    FakeRedis.failing = false;
  }

  // The options every client was created with, in order, so tests can check the connection
  // settings (for example, that each client sends REDIS_PASSWORD). reset() keeps this list,
  // because the clients live as long as the module or app instance that created them.
  static readonly connectionOptions: Array<Record<string, unknown>> = [];

  constructor(options: Record<string, unknown> = {}) {
    FakeRedis.connectionOptions.push(options);
  }

  // Cache commands used by UsersCache (issue #52): a real in-memory store, so a test can see a page
  // being cached, served again and made stale by a version change. Every test starts empty
  // (FakeRedis.reset() in beforeEach), so the route tests still read from the service by default.
  async get(key: string): Promise<string | null> {
    this.failIfDown();
    const entry = this.liveEntry(key);
    return entry ? String(entry.value) : null;
  }

  // SET key value EX seconds (the only form the API uses).
  async set(key: string, value: string, _ex?: 'EX', seconds?: number): Promise<'OK'> {
    this.failIfDown();
    FakeRedis.data.set(key, { value, expiresAt: seconds ? Date.now() + seconds * 1000 : null });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    this.failIfDown();
    const entry = this.liveEntry(key) ?? { value: 0, expiresAt: null };
    entry.value = Number(entry.value) + 1;
    FakeRedis.data.set(key, entry);
    return entry.value;
  }

  // KEYS is no longer used by the API (it blocks Redis); kept so a test can assert it is never called.
  async keys(): Promise<string[]> {
    return [];
  }

  // Connection events are ignored.
  on(): this {
    return this;
  }

  // Graceful shutdown (issue #51): QUIT closes the connection after pending replies.
  async quit(): Promise<'OK'> {
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    this.failIfDown();
    return keys.filter((key) => FakeRedis.data.delete(key)).length;
  }

  async decr(key: string): Promise<number> {
    this.failIfDown();
    const entry = this.liveEntry(key) ?? { value: 0, expiresAt: null };
    entry.value = Number(entry.value) - 1;
    FakeRedis.data.set(key, entry);
    return entry.value;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    this.failIfDown();
    const entry = this.liveEntry(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + milliseconds;
    return 1;
  }

  // MULTI/EXEC with the three commands RedisRateLimitStore queues: SET ... PX ... NX, INCR and PTTL.
  multi() {
    const queued: Array<() => unknown> = [];
    const transaction = {
      set: (key: string, value: number, _px: 'PX', milliseconds: number, _nx: 'NX') => {
        queued.push(() => {
          if (this.liveEntry(key)) return null;
          FakeRedis.data.set(key, { value, expiresAt: Date.now() + milliseconds });
          return 'OK';
        });
        return transaction;
      },
      incr: (key: string) => {
        queued.push(() => {
          const entry = this.liveEntry(key) ?? { value: 0, expiresAt: null };
          entry.value = Number(entry.value) + 1;
          FakeRedis.data.set(key, entry);
          return entry.value;
        });
        return transaction;
      },
      pttl: (key: string) => {
        queued.push(() => {
          const entry = this.liveEntry(key);
          if (!entry) return -2;
          return entry.expiresAt === null ? -1 : entry.expiresAt - Date.now();
        });
        return transaction;
      },
      exec: async (): Promise<Array<[Error | null, unknown]>> => {
        this.failIfDown();
        return queued.map((command) => [null, command()]);
      }
    };
    return transaction;
  }

  // Return the entry for a key, dropping it first if its expiry has passed.
  private liveEntry(key: string): Entry | undefined {
    const entry = FakeRedis.data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      FakeRedis.data.delete(key);
      return undefined;
    }
    return entry;
  }

  // Simulate a Redis outage: ioredis rejects commands when the connection is down.
  private failIfDown(): void {
    if (FakeRedis.failing) {
      throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
    }
  }
}
