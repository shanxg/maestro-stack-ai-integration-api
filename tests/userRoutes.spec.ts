// 🔥 INFRASTRUCTURE REQUIREMENT: Load .env into the test environment.
import 'dotenv/config';

// 1. IMPORTS: Bring in Jest utilities, Supertest, and the crypto helpers used to build credentials.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import yaml from 'js-yaml';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { describe, beforeAll, beforeEach, afterAll, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import type { User } from '../src/models/User.js';
import { FakeRedis } from './helpers/fakeRedis.js';
import { captureLogs } from './helpers/logCapture.js';

// 🚀 GLOBAL INTERCEPTION (MOCK REDIS TCP CONNECTIONS):
// Whenever a file (UserController's cache, or the rate limiters in app.ts) calls 'new Redis()',
// Jest supplies this in-memory fake to avoid network timeouts. The cache always misses, and
// every app instance shares the rate-limit counters, like replicas sharing one Redis server.
jest.unstable_mockModule('ioredis', () => {
  return {
    Redis: FakeRedis
  };
});

// 🔥 MOCK THE EVENT BROKER: The API publishes registrations through EventBrokerService,
// whose constructor opens a RabbitMQ connection and schedules a reconnection timer every
// 5 seconds when the broker is down. Replacing the class keeps the suite independent of
// Docker and lets Jest exit without open handles.
const publishEventMock = jest.fn<(action: string, data: object) => Promise<boolean>>();
// The fake stream answers with the real stream's first message and closes at once, so a test
// request to GET /api/v1/events completes instead of staying open like a real Server-Sent Events stream.
const registerSSEClientMock = jest.fn((_req: unknown, res: http.ServerResponse) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.end('data: {"status": "CONNECTED_TO_MAESTRO_STREAM"}\n\n');
});
jest.unstable_mockModule('../src/services/EventBrokerService.js', () => {
  return {
    EventBrokerService: class {
      publishEvent = publishEventMock;
      registerSSEClient = registerSSEClientMock;
    }
  };
});

// 🍪 SESSION COOKIE HELPER: POST /api/v1/auth/login returns the JWT only in the HttpOnly session cookie.
// Read it from the Set-Cookie header, as a non-browser API client would, to send it as a Bearer token.
const SESSION_COOKIE = 'maestro_session';
const sessionCookieOf = (response: { headers: Record<string, unknown> }): string | undefined => {
  const cookies = (response.headers['set-cookie'] as string[] | undefined) ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
};
const sessionTokenOf = (response: { headers: Record<string, unknown> }): string =>
  decodeURIComponent(sessionCookieOf(response)?.split(';')[0]?.slice(SESSION_COOKIE.length + 1) ?? '');

// 🐘 MOCK THE POSTGRESQL REPOSITORY: createApp() awaits userRepository.initialize(),
// which would open a real connection pool. The routes receive the mock service below,
// so the repository only needs to exist and resolve without touching the network.
jest.unstable_mockModule('../src/repositories/UserRepository.js', () => {
  return {
    UserRepository: class {
      async initialize() {}
      async ping() { return true; }      // readiness probe (issue #51)
      async close() {}                   // graceful shutdown (issue #51)
      async findAll() { return []; }
      async findById() { return null; }
      async findByEmail() { return null; }
      async create(user: User) { return user; }
    }
  };
});

// 🤖 MOCK THE OPENAI SDK: AIService reaches the model server (local Ollama by default) through
// this SDK. The fake client records every chat completion request, so the tests can check the
// limits sent to the model and simulate an unreachable server without any model running.
// The SDK's timeout error (APIConnectionTimeoutError) is a subclass of APIConnectionError.
class FakeAPIConnectionError extends Error {}
const createCompletionMock = jest.fn<(body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<object>>();
jest.unstable_mockModule('openai', () => {
  return {
    default: class {
      chat = { completions: { create: createCompletionMock } };
    },
    APIConnectionError: FakeAPIConnectionError
  };
});

// 🐇 MOCK THE AMQP DRIVER: Only the legacy blueprint (rabbit-deprecated.ts) imports
// 'amqplib' directly now. The fake connection and channel record calls instead of
// opening TCP sockets to a broker.
const fakeChannel = {
  // The shared topology (src/queue/topology.ts): dead-letter exchange and queue, binding, main queue.
  assertExchange: jest.fn<(exchange: string, type: string, options?: object) => Promise<object>>(async () => ({})),
  bindQueue: jest.fn<(queue: string, exchange: string, pattern: string) => Promise<object>>(async () => ({})),
  assertQueue: jest.fn<(queue: string, options?: object) => Promise<object>>(async () => ({}))
};
const fakeConnection = {
  createChannel: jest.fn(async () => fakeChannel),
  close: jest.fn(async () => undefined)
};
const connectMock = jest.fn(async () => fakeConnection);
jest.unstable_mockModule('amqplib', () => {
  return {
    default: { connect: connectMock },
    connect: connectMock
  };
});

// 2. FACTORY IMPORT: Bring in the modular application factory.
// Dynamic imports run after the mocks above are registered (ESM has no mock hoisting).
const { createApp } = await import('../src/app.js');
const { env, settings } = await import('../src/config.js');
const { signAccessToken } = await import('../src/auth/accessToken.js');
// The shared logger (issue #53): tests that check what is logged spy on its methods.
const { logger } = await import('../src/logger.js');

// 3. LEGACY BLUEPRINT IMPORTS: The API never imports these modules (see README.md,
// "Architectural Evolution"). They are loaded here only to test them in isolation.
const rabbitModule = await import('../src/queue/rabbit-deprecated.js');
const socketModule = await import('../src/realtime/socket-deprecated.js');
const workerModule = await import('../src/worker-deprecated.js');

describe('User routes (integration tests)', () => {
  let serverTarget: http.Server;
  let tokenAdmin: string;
  let tokenRegular: string;
  const REGULAR_ID = 'regular-id';

  // 🔑 TEST ACCOUNT: POST /api/v1/auth/login now looks the account up by e-mail and compares the
  // password with bcrypt. The password is random per run and its hash is built in beforeAll.
  const ADMIN_EMAIL = 'admin@maestro.test';
  const ADMIN_PASSWORD = crypto.randomUUID();
  let adminPasswordHash = '';

  // 🏭 SERVICE MOCK: Create a simple object with the same methods as the real UserService.
  const mockUserService = {
    // Same contract as UserService.hashPassword; cost factor 4 keeps the suite fast.
    hashPassword: jest.fn<(password: string) => Promise<string>>(async (password) => bcrypt.hash(password, 4)),
    createUser: jest.fn().mockResolvedValue({
      id: 'mock-id-123',
      name: 'Lucas Integrado',
      email: 'lucas@integrado.com'
    } as never),
    getAllUsers: jest.fn().mockResolvedValue([
      { id: '1', name: 'Lucas Integrado', email: 'lucas@integrado.com' }
    ] as never),
    // Return null for ID '999' to simulate a missing user.
    getUserById: jest.fn<(id: string) => Promise<User | null>>(async (id) => {
      if (id === '999') return null;
      return { id, name: 'Lucas Buscado', email: 'lucas@busca.com' };
    }),
    // Return the stored hash and the ADMIN role only for the test administrator, like the PostgreSQL lookup would.
    getUserByEmail: jest.fn<(email: string) => Promise<User | null>>(async (email) => {
      if (email !== ADMIN_EMAIL) return null;
      return { id: 'admin-id', name: 'Maestro Admin', email, password: adminPasswordHash, role: 'ADMIN' };
    })
  };

  beforeAll(async () => {
    // Cost factor 4 is the bcrypt minimum; it keeps the suite fast and is used only in tests.
    adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);

    // 🔥 DYNAMIC INJECTION: Capture the HTTP server instance and inject the mock service.
    serverTarget = await createApp(mockUserService);

    // Log in through the real route and capture a valid JWT for the protected routes.
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    tokenAdmin = sessionTokenOf(response);

    // A regular account (role USER), signed like the login signs tokens.
    tokenRegular = signAccessToken({ id: REGULAR_ID, user: 'Lucas Comum', email: 'comum@maestro.test', role: 'USER' });
  });

  // The rate-limit counters live in the shared fake Redis; start every test from zero.
  beforeEach(() => {
    FakeRedis.reset();
  });

  // TEST 1: Verify that a correct e-mail and password produce a signed JWT.
  // Condition: The mock returns the administrator with a bcrypt hash of the sent password.
  it('POST /api/v1/auth/login -> returns 200 and a JWT when the credentials are valid', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(sessionTokenOf(response)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // header.payload.signature
    expect(response.body.user).toMatchObject({ id: 'admin-id', email: ADMIN_EMAIL });
  });

  // TEST 2: Verify that a wrong password returns the generic 401 error (no user enumeration).
  // Condition: The e-mail exists, but bcrypt.compare fails for the sent password.
  it('POST /api/v1/auth/login -> returns 401 when the password is wrong', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED_ACCESS');
  });

  // TEST 3: Verify that Zod rejects malformed payloads on the public registration route.
  // Condition: Send an invalid name, e-mail, and no password, without any token.
  it('POST /api/v1/users -> returns 400 when the body fails Zod validation', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/users')
      .send({ name: 'Lu', email: 'email_invalido' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
    expect(response.body.error.details).toBeDefined();
  });

  // TEST 4: Verify that authMiddleware rejects requests without credentials.
  // Condition: Attempt anonymous access without an Authorization Bearer token.
  it('GET /api/v1/users -> returns 401 when no JWT is sent', async () => {
    const response = await request(serverTarget).get('/api/v1/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // TEST 5: Verify a successful authenticated request.
  // Condition: Send a valid JWT and pagination parameters, then expect a user list.
  it('GET /api/v1/users -> returns 200 and the paginated user list with a valid JWT', async () => {
    const response = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: 5, offset: 0 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // TEST 6: Verify a successful lookup by ID.
  // Condition: Send an existing user ID with a valid JWT and expect the mapped object.
  it('GET /api/v1/users/:id -> returns 200 and the matching user when the ID exists', async () => {
    const response = await request(serverTarget)
      .get('/api/v1/users/abc-777')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('abc-777');
    expect(response.body.name).toBe('Lucas Buscado');
  });

  // TEST 7: Verify that a missing ID returns HTTP 404.
  // Condition: The mock returns null for ID "999", so the controller should return 404 (Not Found).
  it('GET /api/v1/users/:id -> returns 404 when the user does not exist', async () => {
    const response = await request(serverTarget)
      .get('/api/v1/users/999')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  // TEST 8: Verify successful asynchronous registration through the event broker.
  // Condition: Send a payload that satisfies the Zod schema; the broker mock accepts it.
  it('POST /api/v1/users -> returns 202 and queues only a bcrypt hash of the password', async () => {
    publishEventMock.mockResolvedValueOnce(true);
    const plainPassword = crypto.randomUUID();

    const response = await request(serverTarget)
      .post('/api/v1/users')
      .send({
        name: 'Lucas Novo',
        email: 'lucas.novo@maestro.com',
        password: plainPassword
      });

    expect(response.status).toBe(202);
    expect(response.body.message).toContain('Solicitação de cadastro recebida com sucesso!');

    // 🛡️ CLEARTEXT SHIELD (CWE-256): The queued event must carry the hash, never the password.
    const [action, queuedData] = publishEventMock.mock.calls[0] as [string, { password: string }];
    expect(action).toBe('user_created');
    expect(queuedData.password).not.toBe(plainPassword);
    expect(queuedData.password).toMatch(/^\$2[aby]\$/);
  });

  // TEST 9: Verify Zod rejects invalid sizes and formats even for an authenticated caller.
  // Condition: Send a body that violates the minimum name length and email format rules.
  it('POST /api/v1/users -> returns 400 when the body violates the size and e-mail rules', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        name: 'Lu',
        email: 'email_invalido',
        password: '123'
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
  });

  // TEST 10: Verify that the login limiter from src/config.ts blocks brute force (CWE-307).
  // Condition: The app accepts exactly settings.rateLimits.login.max attempts; the next one gets 429.
  it('POST /api/v1/auth/login -> returns 429 after the configured number of attempts', async () => {
    // The shared counters are reset before each test, so the logins in the tests above do not count.
    const freshServer = await createApp(mockUserService);
    const attempt = () => request(freshServer)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: 'wrong-password' });

    for (let i = 0; i < settings.rateLimits.login.max; i++) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('AUTH_FLOOD_DETECTED');
  });

  // TEST 11: Verify GET /api/v1/users rejects pagination that breaks the listUsersSchema rules.
  // Condition: Non-numeric, fractional, zero, negative and above-the-cap values never reach the service.
  it('GET /api/v1/users -> returns 400 when limit or offset is not a whole number in range', async () => {
    mockUserService.getAllUsers.mockClear();
    const invalidQueries = [
      { limit: 'abc' },
      { limit: 2.5 },
      { limit: 0 },
      { limit: settings.pagination.maxLimit + 1 },
      { offset: -1 }
    ];

    for (const query of invalidQueries) {
      const response = await request(serverTarget)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .query(query);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILURE');
      expect(response.body.error.details[0].field).toBe(`query.${Object.keys(query)[0]}`);
    }
    expect(mockUserService.getAllUsers).not.toHaveBeenCalled();
  });

  // TEST 12: Verify valid pagination reaches the service as numbers, with the defaults from src/config.ts.
  // Condition: The cap itself is accepted, and a request without parameters gets the default page.
  it('GET /api/v1/users -> passes the cap and the default page to the service as numbers', async () => {
    mockUserService.getAllUsers.mockClear();

    const atCap = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: settings.pagination.maxLimit, offset: 20 });
    const withoutQuery = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(atCap.status).toBe(200);
    expect(withoutQuery.status).toBe(200);
    expect(mockUserService.getAllUsers).toHaveBeenNthCalledWith(1, { limit: settings.pagination.maxLimit, offset: 20 });
    expect(mockUserService.getAllUsers).toHaveBeenNthCalledWith(2, { limit: settings.pagination.defaultLimit, offset: 0 });
  });

  // TEST 13: Verify the login rejects fields that are missing, blank or not text (CWE-1287).
  // Condition: The app gets four malformed bodies (counters reset before each test); none reaches the database.
  it('POST /api/v1/auth/login -> returns 400 when username or password is missing, blank or not text', async () => {
    const freshServer = await createApp(mockUserService);
    mockUserService.getUserByEmail.mockClear();
    const invalidBodies = [
      { username: 123, password: 'any-password' },
      { username: ADMIN_EMAIL, password: ['any-password'] },
      { username: '   ', password: 'any-password' },
      {}
    ];

    for (const body of invalidBodies) {
      const response = await request(freshServer).post('/api/v1/auth/login').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILURE');
    }
    expect(mockUserService.getUserByEmail).not.toHaveBeenCalled();
  });

  // TEST 14: Verify an unknown e-mail still pays the bcrypt cost, so timing does not reveal accounts (CWE-208).
  // Condition: The mock finds no account; bcrypt.compare must still run once, against a hash with the real cost.
  it('POST /api/v1/auth/login -> runs bcrypt with the configured cost when the e-mail is unknown', async () => {
    const freshServer = await createApp(mockUserService);
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    try {
      const response = await request(freshServer)
        .post('/api/v1/auth/login')
        .send({ username: 'nobody@maestro.test', password: 'any-password' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED_ACCESS');
      expect(compareSpy).toHaveBeenCalledTimes(1);
      const comparedHash = compareSpy.mock.calls[0]?.[1] as string;
      expect(bcrypt.getRounds(comparedHash)).toBe(settings.bcryptSaltRounds);
    } finally {
      compareSpy.mockRestore();
    }
  });

  // TEST 15: Verify two API replicas enforce one login limit together, not one each (issue #65).
  // Condition: Two app instances share the fake Redis; attempts on both count toward the same limit.
  it('POST /api/v1/auth/login -> two replicas share one login limit through Redis', async () => {
    const replicaA = await createApp(mockUserService);
    const replicaB = await createApp(mockUserService);
    const attempt = (server: http.Server) => request(server)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: 'wrong-password' });

    // Split the allowed attempts between the replicas, as a load balancer would.
    for (let i = 0; i < settings.rateLimits.login.max; i++) {
      expect((await attempt(i % 2 === 0 ? replicaA : replicaB)).status).toBe(401);
    }

    // Each replica has seen fewer than max attempts, but the shared counter is full.
    const blockedOnA = await attempt(replicaA);
    const blockedOnB = await attempt(replicaB);
    expect(blockedOnA.status).toBe(429);
    expect(blockedOnB.status).toBe(429);
    expect(blockedOnA.body.error.code).toBe('AUTH_FLOOD_DETECTED');
  });

  // TEST 16: Verify unknown routes answer with the JSON error envelope, not Express's HTML page.
  // Condition: The ZAP API scan flagged text/html on 404 responses (rule 100001, issue #66).
  it('GET /unknown -> returns 404 with the JSON error envelope', async () => {
    const response = await request(serverTarget).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  // TEST 17: Verify a 500 never echoes the internal error text back to the client (CWE-209).
  // Condition: The service fails with an error that carries an internal database address on each
  // UserController route; the client must get the generic envelope, and the log the full error.
  it('UserController routes -> return a generic 500 without the internal error message', async () => {
    const internalMessage = 'connect ECONNREFUSED 10.0.0.5:5432 (pg_integrated)';
    mockUserService.getAllUsers.mockRejectedValueOnce(new Error(internalMessage) as never);
    mockUserService.getUserById.mockRejectedValueOnce(new Error(internalMessage));
    mockUserService.hashPassword.mockRejectedValueOnce(new Error(internalMessage));

    // Keep the expected error logs to check that the server still records the failure.
    const logs = captureLogs(logger);

    const responses = [
      await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${tokenAdmin}`),
      await request(serverTarget).get('/api/v1/users/abc-777').set('Authorization', `Bearer ${tokenAdmin}`),
      await request(serverTarget)
        .post('/api/v1/users')
        .send({ name: 'Lucas Falha', email: 'lucas.falha@maestro.com', password: crypto.randomUUID() })
    ];

    // pino's error key is 'err': errorHandler logs { err: error, ... } for every unexpected failure.
    const loggedErrors = logs.errorCalls().map((call) => (call[0] as { err?: unknown }).err);
    logs.restore();

    for (const response of responses) {
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(response.body.error.details).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    }

    // The full error is not lost: it reaches the server log, where operators can investigate it.
    expect(loggedErrors.some((entry) => entry instanceof Error && entry.message === internalMessage)).toBe(true);
  });

  // TEST 18: Verify a rejected JWT does not reveal which verification check failed (CWE-209).
  // Condition: Send a token signed with another secret; jsonwebtoken reports "invalid signature".
  it('GET /api/v1/users -> returns 401 without the JWT verification error', async () => {
    const forgedToken = jwt.sign({ id: 'attacker', role: 'USER' }, crypto.randomUUID());

    const response = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('signature');
  });

  // TEST 19: Verify a malformed JSON body gets the JSON envelope, not Express's HTML stack trace.
  // Condition: Outside production, Express's default handler answered this with an HTML page
  // holding the stack trace and the server's file paths (node_modules/body-parser/...).
  it('POST /api/v1/users -> returns 400 in JSON, without a stack trace, for a malformed body', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/users')
      .set('Content-Type', 'application/json')
      .send('{"name": "Lucas", ');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.code).toBe('INVALID_REQUEST_BODY');
    expect(response.text).not.toContain('node_modules');
  });

  // TEST 20: Verify a broker outage answers 503 with a client-safe message (AppError).
  // Condition: publishEvent returns false, as it does when the RabbitMQ channel is offline.
  it('POST /api/v1/users -> returns 503 when the broker refuses the event', async () => {
    publishEventMock.mockResolvedValueOnce(false);

    const response = await request(serverTarget)
      .post('/api/v1/users')
      .send({ name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: crypto.randomUUID() });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body.error.details).toBeUndefined();
  });

  // TEST 21: Verify every Redis client authenticates with REDIS_PASSWORD (CWE-306, issue #106).
  // Condition: The users cache (created when UserController loads) and the rate-limit client
  // (created by createApp) must both receive the password; the fake records their options.
  it('Redis clients -> connect with the REDIS_PASSWORD from src/config.ts', () => {
    // At least two clients exist by now: the UserController cache and one per createApp() call.
    expect(FakeRedis.connectionOptions.length).toBeGreaterThanOrEqual(2);

    for (const options of FakeRedis.connectionOptions) {
      expect(options.password).toBe(process.env.REDIS_PASSWORD);
    }
  });

  // TEST 22: Verify the login issues HS256 tokens that name this API as issuer and audience (CWE-347).
  // Condition: Log in with the test account and decode the token header and claims (without verifying).
  it('POST /api/v1/auth/login -> issues an HS256 token with the issuer and audience from src/config.ts', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    const decoded = jwt.decode(sessionTokenOf(response), { complete: true }) as jwt.Jwt;
    const claims = decoded.payload as jwt.JwtPayload;

    expect(claims.iss).toBeDefined();
    expect(decoded.header.alg).toBe(settings.jwt.algorithm);
    expect(claims).toMatchObject({ iss: settings.jwt.issuer, aud: settings.jwt.audience, id: 'admin-id' });
  });

  // TEST 23: Verify a token signed with the API secret is still rejected when it breaks a pinned rule.
  // Condition: Three tokens signed with the real JWT_SECRET: one without issuer and audience (as every
  // token was before), one with another HMAC algorithm (HS512) and one issued for another audience.
  it('GET /api/v1/users -> returns 401 for tokens without iss/aud, with another algorithm or for another audience', async () => {
    const claims = { id: 'admin-id', user: 'Maestro Admin', email: ADMIN_EMAIL, role: 'USER' };

    // Send the token to a protected route and expect the generic 401, naming the case on failure.
    const expectRejected = async (name: string, token: string) => {
      const response = await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${token}`);

      expect({ token: name, status: response.status, code: response.body.error?.code })
        .toEqual({ token: name, status: 401, code: 'INVALID_TOKEN' });
    };

    // Signed like every token was before this fix: the right secret, but no issuer or audience.
    await expectRejected('withoutIssuerOrAudience', jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' }));

    // Right secret, issuer and audience, but an algorithm other than the pinned HS256.
    const pinned = { issuer: settings.jwt.issuer, audience: settings.jwt.audience, expiresIn: '5m' } as const;
    await expectRejected('anotherAlgorithm', jwt.sign(claims, env.JWT_SECRET, { ...pinned, algorithm: 'HS512' }));

    // Right secret, algorithm and issuer, but issued for another service.
    await expectRejected('anotherAudience', jwt.sign(claims, env.JWT_SECRET, { ...pinned, algorithm: 'HS256', audience: 'another-service' }));
  });

  // TEST 24: Verify a regular account cannot list every user (BFLA, OWASP API5:2023, issue #36).
  // Condition: A USER token gets 403 before the cache or the service is touched; the admin still gets the list.
  it('GET /api/v1/users -> returns 403 for a regular account and 200 for an admin', async () => {
    mockUserService.getAllUsers.mockClear();

    const regular = await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${tokenRegular}`);
    expect(regular.status).toBe(403);
    expect(regular.body.error.code).toBe('FORBIDDEN');
    expect(mockUserService.getAllUsers).not.toHaveBeenCalled();

    const admin = await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(admin.status).toBe(200);
  });

  // TEST 25: Verify a regular account reads only its own record (BOLA, OWASP API1:2023, issue #36).
  // Condition: Another account's id gets 403 without a lookup, existing or not; its own id gets 200.
  it('GET /api/v1/users/:id -> returns 403 for another account and 200 for its own id', async () => {
    mockUserService.getUserById.mockClear();

    for (const otherId of ['abc-777', '999']) {
      const other = await request(serverTarget).get(`/api/v1/users/${otherId}`).set('Authorization', `Bearer ${tokenRegular}`);
      expect({ id: otherId, status: other.status, code: other.body.error?.code }).toEqual({ id: otherId, status: 403, code: 'FORBIDDEN' });
    }
    expect(mockUserService.getUserById).not.toHaveBeenCalled();

    const own = await request(serverTarget).get(`/api/v1/users/${REGULAR_ID}`).set('Authorization', `Bearer ${tokenRegular}`);
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(REGULAR_ID);
  });

  // TEST 26: Verify GET /api/v1/users/me returns the caller's own record, with the id taken from the token.
  // Condition: A regular account calls /api/v1/users/me and must get its own record, not a user whose id is "me".
  it('GET /api/v1/users/me -> returns the record of the account in the token', async () => {
    const response = await request(serverTarget).get('/api/v1/users/me').set('Authorization', `Bearer ${tokenRegular}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(REGULAR_ID);
  });

  // TEST 27: Verify the login copies the account's role from the database into the token.
  // Condition: The test administrator's record has role ADMIN, so its token must say ADMIN.
  it('POST /api/v1/auth/login -> puts the account role from the database in the token', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(jwt.decode(sessionTokenOf(response))).toMatchObject({ id: 'admin-id', role: 'ADMIN' });
  });

  // Log in as the test administrator and return the "name=value" pair a browser would send back.
  const loginCookiePair = async (): Promise<string> => {
    const login = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    return (sessionCookieOf(login) ?? '').split(';')[0] ?? '';
  };

  // TEST 28: Verify the login keeps the JWT out of reach of page scripts (CWE-922, issue #34).
  // Condition: The session cookie must be HttpOnly, SameSite=Strict, Path=/ and expire with the token,
  // and the response body must not carry the token.
  it('POST /api/v1/auth/login -> sets an HttpOnly, SameSite=Strict session cookie and keeps the token out of the body', async () => {
    const response = await request(serverTarget)
      .post('/api/v1/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    const cookie = sessionCookieOf(response) ?? '';
    expect(cookie).not.toBe('');
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Strict/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(new RegExp(`;\\s*Max-Age=${settings.sessionCookie.maxAgeSeconds}`, 'i'));
    expect(JSON.stringify(response.body)).not.toContain(sessionTokenOf(response));
  });

  // TEST 29: Verify the session cookie alone authenticates a request, as the browser sends no header.
  // Condition: Call GET /api/v1/users/me with only the Cookie header returned by the login.
  it('GET /api/v1/users/me -> accepts the session cookie without an Authorization header', async () => {
    const cookiePair = await loginCookiePair();

    const response = await request(serverTarget).get('/api/v1/users/me').set('Cookie', cookiePair);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('admin-id');
  });

  // TEST 30: Verify a state-changing request from a foreign page is refused (CSRF, CWE-352).
  // Condition: A POST whose Origin is not in ALLOWED_ORIGINS (src/config.ts) gets 403 before the route runs;
  // the same request from the frontend's origin goes through.
  it('POST /api/v1/auth/login -> returns 403 for a foreign Origin and accepts the frontend origin', async () => {
    mockUserService.getUserByEmail.mockClear();

    const foreign = await request(serverTarget)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    expect(mockUserService.getUserByEmail).not.toHaveBeenCalled();

    const frontend = await request(serverTarget)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(frontend.status).toBe(200);
  });

  // TEST 31: Verify a CORS preflight from a foreign origin is not granted (CWE-942, issue #35).
  // Condition: The removed OPTIONS handler echoed any Origin; the cors middleware must echo only
  // an allowed origin, together with Allow-Credentials for the session cookie.
  it('OPTIONS preflight -> echoes only an allowed origin', async () => {
    const foreign = await request(serverTarget)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(serverTarget)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
  });

  // TEST 32: Verify the event stream requires a session (issue #35).
  // Condition: Without a token the stream is refused before it opens; with the session cookie
  // (what EventSource sends with withCredentials: true) it opens.
  it('GET /api/v1/events -> returns 401 without a session and opens the stream with the session cookie', async () => {
    registerSSEClientMock.mockClear();

    const anonymous = await request(serverTarget).get('/api/v1/events');
    expect(anonymous.status).toBe(401);
    expect(registerSSEClientMock).not.toHaveBeenCalled();

    // Log in first: Supertest starts and stops the shared server per request, so one request
    // must not be built while another is still running.
    const cookiePair = await loginCookiePair();
    const withCookie = await request(serverTarget).get('/api/v1/events').set('Cookie', cookiePair);
    expect(withCookie.status).toBe(200);
    expect(withCookie.headers['content-type']).toMatch(/text\/event-stream/);
  });

  // TEST 33: Verify the logout clears the session cookie with the same attributes it was set with.
  // Condition: The browser only removes a cookie when name, path and flags match, so the clearing
  // Set-Cookie must be an empty, already expired, HttpOnly cookie on Path=/.
  it('POST /api/v1/auth/logout -> clears the session cookie', async () => {
    const response = await request(serverTarget).post('/api/v1/auth/logout');

    expect(response.status).toBe(204);
    const cookie = sessionCookieOf(response) ?? '';
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
  });

  // TEST 34: Verify no user route returns the password hash, the role or any other internal field (issue #48).
  // Condition: The service returns records that carry a bcrypt hash, the role and an extra column, as a
  // future query could; the list, the lookup by id and /api/v1/users/me must answer only id, name and email.
  it('GET /api/v1/users, /api/v1/users/:id and /api/v1/users/me -> answer only the public fields of a user', async () => {
    const internalRecord = {
      id: 'abc-777',
      name: 'Lucas Interno',
      email: 'interno@maestro.test',
      password: adminPasswordHash,
      role: 'ADMIN',
      created_at: '2026-10-16T21:00:00.000Z'
    };
    const publicView = { id: 'abc-777', name: 'Lucas Interno', email: 'interno@maestro.test' };
    mockUserService.getAllUsers.mockResolvedValueOnce([internalRecord] as never);
    mockUserService.getUserById
      .mockResolvedValueOnce(internalRecord as never)
      .mockResolvedValueOnce({ ...internalRecord, id: 'admin-id' } as never);

    const list = await request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${tokenAdmin}`);
    const byId = await request(serverTarget).get('/api/v1/users/abc-777').set('Authorization', `Bearer ${tokenAdmin}`);
    const me = await request(serverTarget).get('/api/v1/users/me').set('Authorization', `Bearer ${tokenAdmin}`);

    // Exact equality: any extra property (hash, role, timestamps) fails the test, not only the password.
    expect(list.body).toEqual([publicView]);
    expect(byId.body).toEqual(publicView);
    expect(me.body).toEqual({ ...publicView, id: 'admin-id' });
    for (const response of [list, byId, me]) {
      expect(response.text).not.toContain(adminPasswordHash);
    }
  });

  // TEST 35: Verify the login and the registration log no e-mail, name or password (CWE-532, issue #53).
  // Condition: A failed login, a successful login and a registration, each with a recognizable value;
  // before, the login printed the e-mail of every attempt.
  it('POST /api/v1/auth/login and POST /api/v1/users -> log no e-mail, name or password', async () => {
    const freshServer = await createApp(mockUserService);
    const registration = { name: 'Lucas Rastreavel', email: 'rastreavel@maestro.test', password: crypto.randomUUID() };
    publishEventMock.mockResolvedValueOnce(true);

    const logs = captureLogs(logger);
    try {
      expect((await request(freshServer).post('/api/v1/auth/login').send({ username: 'nobody@maestro.test', password: 'wrong-password' })).status).toBe(401);
      expect((await request(freshServer).post('/api/v1/auth/login').send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })).status).toBe(200);
      expect((await request(freshServer).post('/api/v1/users').send(registration)).status).toBe(202);

      // The requests were logged (the success by account id), but no personal value was.
      expect(logs.text()).toContain('admin-id');
      for (const personal of ['nobody@maestro.test', ADMIN_EMAIL, ADMIN_PASSWORD, registration.email, registration.name, registration.password]) {
        expect({ personal, logged: logs.text().includes(personal) }).toEqual({ personal, logged: false });
      }
    } finally {
      logs.restore();
    }
  });

  // TEST 36: Verify a registration never scans Redis with KEYS (issue #52).
  // Condition: A valid registration; before, the route ran redis.keys('users:*'), which blocks Redis
  // while it walks every key, rate-limit counters included.
  it('POST /api/v1/users -> queues the registration without a KEYS scan of Redis', async () => {
    publishEventMock.mockResolvedValueOnce(true);
    const keysSpy = jest.spyOn(FakeRedis.prototype, 'keys');

    try {
      const response = await request(serverTarget)
        .post('/api/v1/users')
        .send({ name: 'Lucas Sem Scan', email: 'sem.scan@maestro.test', password: crypto.randomUUID() });

      expect(response.status).toBe(202);
      expect(keysSpy).not.toHaveBeenCalled();
    } finally {
      keysSpy.mockRestore();
    }
  });

  // TEST 37: Verify GET /api/v1/users serves a cached page until the cache version changes (issue #52).
  // Condition: The same page is read twice, then the version is bumped (what the queue consumer does
  // after saving an account); the third read must reach the service again.
  it('GET /api/v1/users -> serves the cached page, and reads the database again after the version changes', async () => {
    mockUserService.getAllUsers.mockClear();
    const readPage = () => request(serverTarget).get('/api/v1/users').set('Authorization', `Bearer ${tokenAdmin}`).query({ limit: 7, offset: 0 });

    expect((await readPage()).status).toBe(200);
    expect((await readPage()).status).toBe(200);
    expect(mockUserService.getAllUsers).toHaveBeenCalledTimes(1);

    await new FakeRedis().incr('users:cache-version');

    expect((await readPage()).status).toBe(200);
    expect(mockUserService.getAllUsers).toHaveBeenCalledTimes(2);
  });

  // TEST 38: Verify every route lives under /api/v1 and the old unversioned paths are gone (issue #49).
  // Condition: The login works at /api/v1/auth/login; /auth/login, /users, /users/me, /ai/chat and
  // /events, which coexisted with /api/v1/users before, must answer the JSON 404 like any unknown path.
  it('serves the API under /api/v1 and answers 404 on the old unversioned paths', async () => {
    const login = await request(serverTarget).post('/api/v1/auth/login').send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);

    // Each request is built only when its turn comes: Supertest starts and stops the shared server
    // per request, so two requests must not be in flight at once (see TEST 32).
    const oldPaths: Array<[string, () => request.Test]> = [
      ['POST /auth/login', () => request(serverTarget).post('/auth/login').send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD })],
      ['GET /users', () => request(serverTarget).get('/users').set('Authorization', `Bearer ${tokenAdmin}`)],
      ['GET /users/me', () => request(serverTarget).get('/users/me').set('Authorization', `Bearer ${tokenAdmin}`)],
      ['POST /ai/chat', () => request(serverTarget).post('/ai/chat').set('Authorization', `Bearer ${tokenAdmin}`).send({ prompt: 'Olá' })],
      ['GET /events', () => request(serverTarget).get('/events').set('Authorization', `Bearer ${tokenAdmin}`)]
    ];
    for (const [path, send] of oldPaths) {
      const response = await send();
      expect({ path, status: response.status, code: response.body.error?.code })
        .toEqual({ path, status: 404, code: 'NOT_FOUND' });
    }
  });

  // TEST 39: Verify the user id in the path is validated like every other input (issue #49).
  // Condition: A blank id and a 51-character id; before, a blank id got a hand-written 400 BAD_REQUEST
  // and an oversized one reached the database.
  it('GET /api/v1/users/:id -> returns 400 VALIDATION_FAILURE for a blank or oversized id', async () => {
    mockUserService.getUserById.mockClear();

    for (const id of ['%20', 'a'.repeat(51)]) {
      const response = await request(serverTarget).get(`/api/v1/users/${id}`).set('Authorization', `Bearer ${tokenAdmin}`);

      expect({ id, status: response.status, code: response.body.error?.code, field: response.body.error?.details?.[0]?.field })
        .toEqual({ id, status: 400, code: 'VALIDATION_FAILURE', field: 'params.id' });
    }
    expect(mockUserService.getUserById).not.toHaveBeenCalled();
  });

  // TEST 40: Verify an expired token is rejected even when everything else about it is valid (issue #56).
  // Condition: Signed with the API secret, HS256, the right issuer and audience, but "exp" one minute in
  // the past, so the expiry is the only check that can fail (a wrong key would repeat TEST 18). The
  // answer must be the generic 401: no "jwt expired" text that tells a caller why (CWE-209).
  it('GET /api/v1/users -> returns 401 for an expired token signed with the correct key', async () => {
    mockUserService.getAllUsers.mockClear();
    const expiredToken = jwt.sign(
      {
        id: 'admin-id',
        user: 'Maestro Admin',
        email: ADMIN_EMAIL,
        role: 'ADMIN', // an admin token: even the highest role gets nothing once expired
        exp: Math.floor(Date.now() / 1000) - 60 // expired one minute ago
      },
      env.JWT_SECRET,
      { algorithm: settings.jwt.algorithm, issuer: settings.jwt.issuer, audience: settings.jwt.audience }
    );

    const response = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/expired/i);
    expect(mockUserService.getAllUsers).not.toHaveBeenCalled();
  });

  // TEST 41: Verify an unsigned token ("alg": "none") is rejected (CWE-347, issue #56).
  // Condition: jsonwebtoken refuses to sign such a token, so it is assembled by hand: base64url header
  // and payload with valid issuer, audience and expiry, and an empty signature segment. With a secret
  // configured, jwt.verify answers "jwt signature is required" before it even compares the algorithm
  // with the pinned HS256; the client must still get the generic 401 without that text (CWE-209).
  it('GET /api/v1/users -> returns 401 for an unsigned token with alg "none"', async () => {
    mockUserService.getAllUsers.mockClear();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      id: 'admin-id',
      user: 'Maestro Admin',
      email: ADMIN_EMAIL,
      role: 'ADMIN', // a forged admin claim: the classic goal of an alg "none" token
      iss: settings.jwt.issuer,
      aud: settings.jwt.audience,
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    const unsignedToken = `${header}.${payload}.`; // the third segment (the signature) is empty

    const response = await request(serverTarget)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${unsignedToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(response.body.error.details).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/signature|algorithm/i);
    expect(mockUserService.getAllUsers).not.toHaveBeenCalled();
  });
});

describe('AI chat route (integration tests)', () => {
  let serverTarget: http.Server;

  // 🔑 TEST ACCOUNTS: tokens signed by src/auth/accessToken.ts with the same claims that
  // POST /api/v1/auth/login issues, so each test can act as a different account.
  const tokenFor = (id: string) =>
    signAccessToken({ id, user: `User ${id}`, email: `${id}@maestro.test`, role: 'USER' });

  // Send one prompt to /api/v1/ai/chat as the given account.
  const sendPrompt = (token: string, prompt: unknown) =>
    request(serverTarget).post('/api/v1/ai/chat').set('Authorization', `Bearer ${token}`).send({ prompt });

  beforeAll(async () => {
    // No custom user service: the chat route does not touch users, and the repository is mocked.
    serverTarget = await createApp();
  });

  // Start every test with empty rate-limit counters and a model that answers at once.
  beforeEach(() => {
    FakeRedis.reset();
    createCompletionMock.mockReset();
    createCompletionMock.mockResolvedValue({ choices: [{ message: { content: 'Resposta de teste.' } }] });
  });

  // TEST 1: Verify an oversized prompt is rejected before it reaches the model (CWE-770 / LLM10:2025).
  // Condition: A 50,000-character prompt, far above the limit, must answer 400; a prompt of exactly
  // settings.aiChat.maxPromptLength characters is still accepted.
  it('POST /api/v1/ai/chat -> returns 400 for a prompt over the length limit, without calling the model', async () => {
    const oversized = await sendPrompt(tokenFor('user-a'), 'a'.repeat(50_000));

    expect(oversized.status).toBe(400);
    expect(oversized.body.error.code).toBe('VALIDATION_FAILURE');
    expect(oversized.body.error.details[0].field).toBe('body.prompt');
    expect(createCompletionMock).not.toHaveBeenCalled();

    const atTheLimit = await sendPrompt(tokenFor('user-a'), 'a'.repeat(settings.aiChat.maxPromptLength));
    expect(atTheLimit.status).toBe(200);
  });

  // TEST 2: Verify every model call carries the output and time ceilings from src/config.ts.
  // Condition: A valid prompt; the request sent to the SDK must hold max_tokens, the configured
  // model, the timeout and no automatic retries.
  it('POST /api/v1/ai/chat -> sends max_tokens, the configured model, a timeout and no retries to the model', async () => {
    const response = await sendPrompt(tokenFor('user-a'), '  Explique o padrão Cache-Aside.  ');

    expect(response.status).toBe(200);
    expect(response.body.response).toBe('Resposta de teste.');

    const [body, options] = createCompletionMock.mock.calls[0] as [Record<string, unknown>, Record<string, unknown> | undefined];
    expect(body).toHaveProperty('max_tokens');
    expect(options).toBeDefined();
    expect(body).toMatchObject({ model: env.OPENAI_MODEL, max_tokens: settings.aiChat.maxTokens });
    expect(options).toMatchObject({ timeout: settings.aiChat.timeoutMs, maxRetries: 0 });

    // The prompt reaches the model trimmed, as chatSchema returns it.
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Explique o padrão Cache-Aside.' });
  });

  // TEST 3: Verify an unreachable or timed-out model server answers 503 without connection details.
  // Condition: The SDK fails with a connection error, as it does when Ollama is down or too slow.
  it('POST /api/v1/ai/chat -> returns 503 when the model server cannot be reached', async () => {
    createCompletionMock.mockRejectedValueOnce(new FakeAPIConnectionError('connect ECONNREFUSED 127.0.0.1:11434'));
    const warnSpy = jest.spyOn(logger, 'warn');

    const response = await sendPrompt(tokenFor('user-a'), 'Olá?');
    warnSpy.mockRestore();

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });

  // TEST 4: Verify the prompt limit counts per account, not per IP address.
  // Condition: Two accounts behind the same IP (every Supertest request comes from 127.0.0.1).
  // Account A uses its whole budget and gets 429; account B must still be served.
  it('POST /api/v1/ai/chat -> limits each account separately, even from the same IP', async () => {
    const tokenA = tokenFor('user-a');
    const tokenB = tokenFor('user-b');

    for (let i = 0; i < settings.rateLimits.aiChat.max; i++) {
      expect((await sendPrompt(tokenA, `Pergunta ${i}`)).status).toBe(200);
    }

    const blockedA = await sendPrompt(tokenA, 'Mais uma pergunta');
    expect(blockedA.status).toBe(429);
    expect(blockedA.body.error.code).toBe('LLM_COMPUTE_LIMIT_EXCEEDED');

    const servedB = await sendPrompt(tokenB, 'Primeira pergunta de outra conta');
    expect(servedB.status).toBe(200);
  });

});

describe('API contract (openapi.yaml)', () => {
  let serverTarget: http.Server;

  // The parts of openapi.yaml these tests read: each path, its operations and their security.
  type Operation = { security?: Array<Record<string, string[]>> };
  type Spec = { security?: Array<Record<string, string[]>>; paths: Record<string, Record<string, Operation>> };
  const spec = yaml.load(fs.readFileSync('openapi.yaml', 'utf8')) as Spec;
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

  // Every documented operation as "METHOD /path", with its effective security: the operation's own
  // list, or the global one when it has none. An empty list (security: []) marks a public route.
  const documentedOperations = Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.entries(operations)
      .filter(([method]) => httpMethods.includes(method))
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        isProtected: (operation.security ?? spec.security ?? []).length > 0
      }))
  );

  // Every route registered on the Express app, as "METHOD /path" in OpenAPI notation (":id" -> "{id}").
  // createApp() returns the HTTP server; its 'request' listener is the Express app. The routes live in
  // routers (src/routes/, issue #46) mounted at '/', each declaring full paths, so the walk descends
  // into every router layer (its 'handle' has a stack of its own). The OPTIONS handler for CORS
  // preflights is infrastructure, not an API operation, so it is left out.
  const registeredRoutes = (server: http.Server): string[] => {
    type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };
    const app = server.listeners('request')[0] as unknown as { router: { stack: Layer[] } };
    const walk = (stack: Layer[]): string[] => stack.flatMap((layer) => {
      const route = layer.route;
      if (!route) return layer.handle?.stack ? walk(layer.handle.stack) : [];
      return Object.keys(route.methods)
        .filter((method) => httpMethods.includes(method))
        .map((method) => `${method.toUpperCase()} ${route.path.replace(/:(\w+)/g, '{$1}')}`);
    });
    return walk(app.router.stack);
  };

  beforeAll(async () => {
    serverTarget = await createApp();
  });

  beforeEach(() => {
    FakeRedis.reset();
  });

  // TEST 1: Verify every route the app serves is documented, and every documented route exists
  // (OWASP API9:2023, Improper Inventory Management; ADR 0001).
  // Condition: The Express route list and the openapi.yaml operations must be the same set, so an
  // undocumented endpoint (like the retired GraphQL one) cannot be added without updating the spec.
  it('every Express route is in openapi.yaml and every documented operation is served', () => {
    const documented = documentedOperations.map(({ method, path }) => `${method} ${path}`).sort();

    expect(registeredRoutes(serverTarget).sort()).toEqual(documented);
  });

  // TEST 2: Verify every operation documented as protected rejects a request without a token.
  // Condition: For each operation whose effective security is not empty, call it with no
  // Authorization header (path parameters filled with a sample value) and expect 401.
  it('every operation documented as protected answers 401 without a token', async () => {
    const protectedOperations = documentedOperations.filter((operation) => operation.isProtected);
    expect(protectedOperations.length).toBeGreaterThan(0);

    for (const { method, path } of protectedOperations) {
      const url = path.replace(/\{\w+\}/g, 'abc-777');
      const response = await request(serverTarget)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](url).send({});

      expect({ operation: `${method} ${path}`, status: response.status }).toEqual({ operation: `${method} ${path}`, status: 401 });
    }
  });

  // TEST 3: Verify every documented and served path lives under /api/v1 (issue #49).
  // Condition: openapi.yaml listed /auth/login, /users, /ai/chat and /events next to /api/v1/users.
  it('every documented and served path starts with /api/v1', () => {
    const unversioned = [
      ...documentedOperations.map(({ method, path }) => `${method} ${path}`),
      ...registeredRoutes(serverTarget)
    ].filter((operation) => !operation.split(' ')[1]?.startsWith('/api/v1/'));

    expect(unversioned).toEqual([]);
  });

});

describe('Legacy cloud blueprint (deprecated modules, isolated from the API)', () => {

  afterAll(async () => {
    // Release the fake broker connection and close the WebSocket server opened in TEST 4.
    await rabbitModule.closeRabbitChannel();
    await socketModule.closeSocket();
  });

  // TEST 1: Verify the channel factory reuses a single connection per process.
  // Condition: Two calls must share one handshake and declare the queue like EventBrokerService.
  it('rabbit-deprecated -> reuses one connection and declares the shared durable queue', async () => {
    const first = await rabbitModule.getRabbitChannel();
    const second = await rabbitModule.getRabbitChannel();

    expect(second).toBe(first);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(fakeChannel.assertQueue).toHaveBeenCalledWith('user_events', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'user_events.dlx' }
    });
  });

  // TEST 2: Verify the graceful shutdown closes the connection and allows a clean reconnect.
  // Condition: After closeRabbitChannel(), the next call must open a new connection.
  it('rabbit-deprecated -> closes the connection and reconnects on the next call', async () => {
    await rabbitModule.closeRabbitChannel();
    expect(fakeConnection.close).toHaveBeenCalledTimes(1);

    await rabbitModule.getRabbitChannel();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  // TEST 3: Verify the WebSocket handshake firewall mirrors the REST JWT checks.
  // Condition: A missing token and a forged token are refused; a signed token is accepted.
  it('socket-deprecated -> accepts only handshakes that carry a valid JWT', () => {
    const authenticate = socketModule.createHandshakeAuthenticator();

    const missingNext = jest.fn();
    authenticate({ handshake: { auth: {} }, data: {} } as never, missingNext);
    expect(missingNext).toHaveBeenCalledWith(expect.any(Error));

    const forgedNext = jest.fn();
    authenticate({ handshake: { auth: { token: 'forged.token.value' } }, data: {} } as never, forgedNext);
    expect(forgedNext).toHaveBeenCalledWith(expect.any(Error));

    const validSocket = {
      handshake: { auth: { token: signAccessToken({ id: 'admin-id', user: 'Maestro Admin', email: 'admin@maestro.test', role: 'USER' }) } },
      data: {} as { user?: unknown }
    };
    const validNext = jest.fn();
    authenticate(validSocket as never, validNext);
    expect(validNext).toHaveBeenCalledWith();
    expect(validSocket.data.user).toMatchObject({ id: 'admin-id' });
  });

  // TEST 4: Verify the worker persists a valid event, pushes it without the hash, and acks it.
  // Condition: The message follows the envelope that UserController publishes today.
  it('worker-deprecated -> persists a valid user_created event and broadcasts it without the hash', async () => {
    socketModule.initializeSocket(http.createServer());
    const emitSpy = jest.spyOn(socketModule.io as NonNullable<typeof socketModule.io>, 'emit');

    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 4);
    const createUserWithPasswordHash = jest.fn<(name: string, email: string, passwordHash: string) => Promise<User>>(async (name, email) => ({
      id: 'queued-id',
      name,
      email,
      password: passwordHash
    }));
    const channel = { ack: jest.fn(), nack: jest.fn() };
    const message = {
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: passwordHash }
      }))
    };

    await workerModule.processUserEventMessage(channel as never, message as never, { createUserWithPasswordHash } as never);

    expect(createUserWithPasswordHash).toHaveBeenCalledWith('Lucas Fila', 'lucas.fila@maestro.com', passwordHash);
    expect(emitSpy).toHaveBeenCalledWith('user_created', {
      id: 'queued-id',
      name: 'Lucas Fila',
      email: 'lucas.fila@maestro.com'
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  // TEST 5: Verify the worker rejects poison messages without persisting them.
  // Condition: A broken JSON and a payload that fails the Zod schema are both nacked, not requeued.
  it('worker-deprecated -> rejects malformed or invalid events without persisting them', async () => {
    const createUserWithPasswordHash = jest.fn();
    const channel = { ack: jest.fn(), nack: jest.fn() };
    const brokenJson = { content: Buffer.from('{not-json') };
    const invalidUser = {
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lu', email: 'email_invalido', password: '123' }
      }))
    };

    await workerModule.processUserEventMessage(channel as never, brokenJson as never, { createUserWithPasswordHash } as never);
    await workerModule.processUserEventMessage(channel as never, invalidUser as never, { createUserWithPasswordHash } as never);

    expect(createUserWithPasswordHash).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenNthCalledWith(1, brokenJson, false, false);
    expect(channel.nack).toHaveBeenNthCalledWith(2, invalidUser, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
