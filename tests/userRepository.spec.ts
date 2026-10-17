// 🐘 USER REPOSITORY: DATABASE FAILURES (CWE-392 / CWE-248, issue #93)
// These tests run the real UserRepository, UserService and routes over a fake 'pg' driver,
// so a PostgreSQL outage can be simulated without stopping a database.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { describe, beforeAll, beforeEach, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { FakeRedis } from './helpers/fakeRedis.js';
import { captureLogs } from './helpers/logCapture.js';

// 1. FAKE POSTGRESQL DRIVER: Every pool shares one query mock, so a test decides how the database
// answers. The pool is an EventEmitter like pg.Pool, so a test can emit the 'error' event pg emits
// for a broken idle connection. DatabaseError mirrors pg's class: an answer from a running server
// that carries a SQLSTATE code.
class FakeDatabaseError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}
const poolQueryMock = jest.fn<(config: unknown) => Promise<{ rows: unknown[] }>>();
class FakePool extends EventEmitter {
  // Every pool created and the options it received, newest last.
  static readonly instances: FakePool[] = [];
  query = poolQueryMock;

  constructor(readonly options: Record<string, unknown>) {
    super();
    FakePool.instances.push(this);
  }

  // initialize() runs its DDL on a dedicated client; the fake accepts it without a database.
  async connect() {
    return { query: async () => ({ rows: [] }), release: () => undefined };
  }
}
jest.unstable_mockModule('pg', () => ({
  default: { Pool: FakePool, DatabaseError: FakeDatabaseError }
}));

// 2. OTHER INFRASTRUCTURE: Redis, RabbitMQ and the model server are replaced as in userRoutes.spec.ts.
jest.unstable_mockModule('ioredis', () => ({ Redis: FakeRedis }));
jest.unstable_mockModule('../src/services/EventBrokerService.js', () => ({
  EventBrokerService: class {
    publishEvent = jest.fn(async () => true);
    registerSSEClient = jest.fn();
  }
}));
jest.unstable_mockModule('openai', () => ({
  default: class {
    chat = { completions: { create: jest.fn() } };
  },
  APIConnectionError: class extends Error {}
}));

// Dynamic imports run after the mocks above are registered (ESM has no mock hoisting).
const { createApp } = await import('../src/app.js');
const { settings } = await import('../src/config.js');
const { signAccessToken } = await import('../src/auth/accessToken.js');
const { UserRepository } = await import('../src/repositories/UserRepository.js');
const { AppError } = await import('../src/errors/AppError.js');
const { logger } = await import('../src/logger.js');

// The ways PostgreSQL can be unavailable, as the 'pg' driver reports them.
const refusedConnection = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5433'), { code: 'ECONNREFUSED' });
const poolTimeout = () => new Error('timeout exceeded when trying to connect');
const serverShuttingDown = () => new FakeDatabaseError('terminating connection due to administrator command', '57P01');

describe('UserRepository database failures (integration tests)', () => {
  let serverTarget: http.Server;
  const adminToken = signAccessToken({ id: 'admin-id', user: 'Maestro Admin', email: 'admin@maestro.test', role: 'ADMIN' });

  beforeAll(async () => {
    // No custom service: the routes use the real UserService over the real UserRepository.
    serverTarget = await createApp();
  });

  beforeEach(() => {
    FakeRedis.reset();
    poolQueryMock.mockReset();
  });

  // TEST 1: Verify each read method reports an unavailable database as a 503 instead of [] or null.
  // Condition: The pool fails with a refused connection, its own connection timeout and a server
  // shutdown (SQLSTATE 57P01). Before, findAll answered [] and findById/findByEmail answered null.
  it('findAll, findById and findByEmail reject with 503 DATABASE_UNAVAILABLE when PostgreSQL is down', async () => {
    const repository = new UserRepository();
    const logs = captureLogs(logger);

    try {
      for (const outage of [refusedConnection, poolTimeout, serverShuttingDown]) {
        const reads = {
          findAll: () => repository.findAll(10, 0),
          findById: () => repository.findById('abc-777'),
          findByEmail: () => repository.findByEmail('admin@maestro.test')
        };

        for (const [method, read] of Object.entries(reads)) {
          poolQueryMock.mockRejectedValueOnce(outage());
          const failure = await read().then(
            (value) => ({ resolvedWith: value }),
            (error: unknown) => error
          );

          expect({ method, outage: outage.name, isAppError: failure instanceof AppError, failure })
            .toMatchObject({ method, outage: outage.name, isAppError: true, failure: { statusCode: 503, code: 'DATABASE_UNAVAILABLE' } });
        }
      }

      // The cause is not lost: the original driver error reaches the server log (pino's 'err' key).
      const loggedErrors = logs.errorCalls().map((call) => (call[0] as { err?: unknown }).err);
      expect(loggedErrors.some((entry) => entry instanceof Error && entry.message.includes('ECONNREFUSED'))).toBe(true);
    } finally {
      logs.restore();
    }
  });

  // TEST 2: Verify a query error from a running server is rethrown as it is, not hidden and not
  // reported as an outage. Condition: SQLSTATE 42P01 (undefined table), as after a broken migration;
  // the central errorHandler then answers its generic 500.
  it('rethrows a SQL error from a running server unchanged', async () => {
    const repository = new UserRepository();
    const queryError = new FakeDatabaseError('relation "users" does not exist', '42P01');

    poolQueryMock.mockRejectedValueOnce(queryError);
    await expect(repository.findAll(10, 0)).rejects.toBe(queryError);

    poolQueryMock.mockRejectedValueOnce(queryError);
    await expect(repository.findById('abc-777')).rejects.toBe(queryError);

    poolQueryMock.mockRejectedValueOnce(queryError);
    await expect(repository.findByEmail('admin@maestro.test')).rejects.toBe(queryError);
  });

  // TEST 3: Verify the routes tell an outage apart from an empty or missing result.
  // Condition: Every query is refused. Before, GET /api/v1/users answered 200 [] and cached it, GET /api/v1/users/{id}
  // and GET /api/v1/users/me answered 404, and POST /api/v1/auth/login answered 401 "invalid credentials".
  it('GET /api/v1/users, GET /api/v1/users/{id}, GET /api/v1/users/me and POST /api/v1/auth/login answer 503 when PostgreSQL is down', async () => {
    poolQueryMock.mockRejectedValue(refusedConnection());
    const cacheWriteSpy = jest.spyOn(FakeRedis.prototype, 'set');
    const logs = captureLogs(logger);

    try {
      const responses = {
        'GET /api/v1/users': await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${adminToken}`),
        'GET /api/v1/users/{id}': await request(serverTarget).get('/api/v1/users/abc-777').set('Authorization', `Bearer ${adminToken}`),
        'GET /api/v1/users/me': await request(serverTarget).get('/api/v1/users/me').set('Authorization', `Bearer ${adminToken}`),
        'POST /api/v1/auth/login': await request(serverTarget).post('/api/v1/auth/login').send({ username: 'admin@maestro.test', password: 'any-password' })
      };

      for (const [route, response] of Object.entries(responses)) {
        expect({ route, status: response.status, code: response.body.error?.code })
          .toEqual({ route, status: 503, code: 'DATABASE_UNAVAILABLE' });
        expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
      }

      // A failed query is never stored as a cached page.
      expect(cacheWriteSpy).not.toHaveBeenCalled();
    } finally {
      cacheWriteSpy.mockRestore();
      logs.restore();
    }
  });

  // TEST 4: Verify a broken idle connection does not crash the API (CWE-248).
  // Condition: The pool emits 'error', as pg does when PostgreSQL restarts. With no listener,
  // Node.js throws the error out of emit(), which stops the process.
  it('handles the pool error event emitted for a broken idle connection', () => {
    new UserRepository();
    const pool = FakePool.instances.at(-1) as FakePool;
    const logs = captureLogs(logger);

    try {
      expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
      expect(logs.errorCalls().length).toBeGreaterThan(0);
    } finally {
      logs.restore();
    }
  });

  // TEST 5: Verify the pool gives up on an unreachable database after the configured time.
  // Condition: Without connectionTimeoutMillis, pg waits for the operating system's TCP timeout.
  it('creates the pool with the size and timeouts from src/config.ts', () => {
    new UserRepository();
    const pool = FakePool.instances.at(-1) as FakePool;

    expect(pool.options).toMatchObject({
      max: settings.database.poolMax,
      idleTimeoutMillis: settings.database.idleTimeoutMs,
      connectionTimeoutMillis: settings.database.connectionTimeoutMs
    });
  });
});
