// 🧪 FAKE REDIS: An in-memory stand-in for the ioredis client, so the suites run without a Redis server.
// Every instance shares one keyspace, the way the API replicas share one Redis server.
type Entry = { value: number; expiresAt: number | null };

export class FakeRedis {
  // The shared keyspace and the outage switch, reset between tests with FakeRedis.reset().
  static readonly data = new Map<string, Entry>();
  static failing = false;

  static reset(): void {
    FakeRedis.data.clear();
    FakeRedis.failing = false;
  }

  // Cache commands used by UserController: always a cache miss, so the routes read from the service.
  async get(): Promise<null> { return null; }
  async set(): Promise<'OK'> { return 'OK'; }
  async keys(): Promise<string[]> { return []; }

  // Connection events are ignored.
  on(): this { return this; }

  async del(...keys: string[]): Promise<number> {
    this.failIfDown();
    return keys.filter((key) => FakeRedis.data.delete(key)).length;
  }

  async decr(key: string): Promise<number> {
    this.failIfDown();
    const entry = this.liveEntry(key) ?? { value: 0, expiresAt: null };
    entry.value -= 1;
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
          entry.value += 1;
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
