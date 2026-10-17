// 🩺 HEALTH PROBES AND GRACEFUL SHUTDOWN (issue #51)
// The app runs over a fake 'pg' driver and a mocked broker, so the tests can make PostgreSQL or
// RabbitMQ unavailable and watch the shutdown release each dependency.
import { EventEmitter } from 'node:events';
import { describe, beforeAll, beforeEach, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { FakeRedis } from './helpers/fakeRedis.js';

// 1. FAKE POSTGRESQL DRIVER: one shared query mock (the readiness ping) and end() for the shutdown.
const poolQueryMock = jest.fn<(config: unknown) => Promise<{ rows: unknown[] }>>();
const poolEndMock = jest.fn(async () => undefined);
class FakePool extends EventEmitter {
  query = poolQueryMock;
  end = poolEndMock;
  async connect() {
    return { query: async () => ({ rows: [] }), release: () => undefined };
  }
}
jest.unstable_mockModule('pg', () => ({
  default: { Pool: FakePool, DatabaseError: class extends Error {} }
}));

// 2. BROKER MOCK: the readiness check reads isConnected(); the shutdown calls close().
const brokerState = { connected: true };
const brokerCloseMock = jest.fn(async () => undefined);
jest.unstable_mockModule('../src/services/EventBrokerService.js', () => ({
  EventBrokerService: class {
    publishEvent = jest.fn(async () => true);
    registerSSEClient = jest.fn();
    isConnected = () => brokerState.connected;
    close = brokerCloseMock;
  }
}));
jest.unstable_mockModule('ioredis', () => ({ Redis: FakeRedis }));
jest.unstable_mockModule('openai', () => ({
  default: class {
    chat = { completions: { create: jest.fn() } };
  },
  APIConnectionError: class extends Error {}
}));

// Dynamic imports run after the mocks above are registered (ESM has no mock hoisting).
const { createApp } = await import('../src/app.js');
const { settings } = await import('../src/config.js');
const { registerShutdownSignals } = await import('../src/lifecycle.js');

// Move the clock past the readiness cache, so the next probe runs the checks again.
let clockOffset = 0;
const realNow = Date.now.bind(Date);
const advancePastReadinessCache = () => {
  clockOffset += settings.health.readinessCacheMs + 1;
};

describe('Health probes and graceful shutdown (integration tests)', () => {
  let serverTarget: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset);
    serverTarget = await createApp();
  });

  beforeEach(() => {
    FakeRedis.reset();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    brokerState.connected = true;
    advancePastReadinessCache();
  });

  // TEST 1: Verify the liveness probe answers without a session and is never rate limited.
  // Condition: More requests than the global per-IP limit allows, as a busy kubelet would send;
  // before, the route did not exist (404).
  it('GET /api/v1/health -> answers 200 without a token, beyond the global rate limit', async () => {
    for (let i = 0; i <= settings.rateLimits.global.max + 2; i++) {
      const response = await request(serverTarget).get('/api/v1/health');
      expect({ attempt: i, status: response.status }).toEqual({ attempt: i, status: 200 });
    }
    expect((await request(serverTarget).get('/api/v1/health')).body).toEqual({ status: 'ok' });
  });

  // TEST 2: Verify readiness follows PostgreSQL and RabbitMQ, without saying which one failed.
  // Condition: Both up, then PostgreSQL refusing connections, then the broker channel closed.
  it('GET /api/v1/health/ready -> 200 when both dependencies answer, 503 when either is down', async () => {
    const ready = await request(serverTarget).get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready' });

    advancePastReadinessCache();
    poolQueryMock.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5433'), { code: 'ECONNREFUSED' }));
    const databaseDown = await request(serverTarget).get('/api/v1/health/ready');
    expect(databaseDown.status).toBe(503);
    expect(databaseDown.body).toEqual({ status: 'not_ready' });

    advancePastReadinessCache();
    poolQueryMock.mockResolvedValue({ rows: [] });
    brokerState.connected = false;
    expect((await request(serverTarget).get('/api/v1/health/ready')).status).toBe(503);
  });

  // TEST 3: Verify the readiness result is reused, so the unthrottled endpoint cannot flood PostgreSQL.
  // Condition: Many probes inside one cache window run the database check once.
  it('GET /api/v1/health/ready -> queries PostgreSQL at most once per cache window', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await request(serverTarget).get('/api/v1/health/ready')).status).toBe(200);
    }
    expect(poolQueryMock).toHaveBeenCalledTimes(1);
  });

  // TEST 4: Verify the shutdown releases every dependency in order and stops reporting ready.
  // Condition: shutdown() on a running app; before, createApp offered no shutdown at all.
  it('shutdown() -> reports not ready, closes the broker, then PostgreSQL and both Redis clients', async () => {
    const app = await createApp();
    const quitSpy = jest.spyOn(FakeRedis.prototype, 'quit');
    brokerCloseMock.mockClear();
    poolEndMock.mockClear();

    try {
      await app.shutdown();

      expect(brokerCloseMock).toHaveBeenCalledTimes(1);
      expect(poolEndMock).toHaveBeenCalledTimes(1);
      expect(brokerCloseMock.mock.invocationCallOrder[0]).toBeLessThan(poolEndMock.mock.invocationCallOrder[0] as number);
      expect(quitSpy).toHaveBeenCalledTimes(2); // the rate-limit client and the users cache client

      // Even with the cache window still open and every dependency up, the replica is out.
      const afterShutdown = await request(app).get('/api/v1/health/ready');
      expect(afterShutdown.status).toBe(503);
    } finally {
      quitSpy.mockRestore();
    }
  });
});

describe('Shutdown signals (src/lifecycle.ts)', () => {
  // A stand-in for 'process': records the signal listeners and the exit code.
  const fakeProcess = () => {
    const listeners = new Map<string, () => void>();
    const exit = jest.fn<(code: number) => void>();
    return {
      proc: { once: (signal: 'SIGTERM' | 'SIGINT', listener: () => void) => listeners.set(signal, listener), exit },
      send: (signal: string) => listeners.get(signal)?.(),
      exit
    };
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  // TEST 5: Verify SIGTERM runs the shutdown once and exits 0; a second signal does not run it again.
  // Condition: Kubernetes sends SIGTERM; an impatient operator then presses Ctrl+C (SIGINT).
  it('runs the shutdown once on SIGTERM and exits 0', async () => {
    const { proc, send, exit } = fakeProcess();
    const shutdown = jest.fn(async () => undefined);
    registerShutdownSignals({ shutdown }, 1_000, proc);

    send('SIGTERM');
    send('SIGINT');
    await flush();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  // TEST 6: Verify a failed or stuck shutdown still ends the process with exit code 1.
  // Condition: One shutdown rejects; another never settles and must be cut by the timeout.
  it('exits 1 when the shutdown fails or does not finish within the timeout', async () => {
    const failing = fakeProcess();
    registerShutdownSignals({ shutdown: async () => { throw new Error('pool.end failed'); } }, 1_000, failing.proc);
    failing.send('SIGTERM');
    await flush();
    expect(failing.exit).toHaveBeenCalledWith(1);

    const stuck = fakeProcess();
    registerShutdownSignals({ shutdown: () => new Promise<void>(() => {}) }, 20, stuck.proc);
    stuck.send('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(stuck.exit).toHaveBeenCalledWith(1);
  });
});
