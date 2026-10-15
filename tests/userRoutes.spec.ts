// 🔥 INFRASTRUCTURE REQUIREMENT: Load .env into the test environment.
import 'dotenv/config';

// 1. IMPORTS: Bring in Jest utilities, Supertest, and the crypto helpers used to build credentials.
import crypto from 'node:crypto';
import http from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import type { User } from '../src/models/User.js';

// 🚀 GLOBAL INTERCEPTION (MOCK REDIS TCP CONNECTIONS):
// Whenever a file (including UserController) calls 'new Redis()',
// Jest supplies this fast in-memory mock to avoid network timeouts.
jest.unstable_mockModule('ioredis', () => {
  return {
    Redis: class {
      async get() { return null; } // Simulate a cache miss so the route reads from the service
      async set() { return 'OK'; }
      async keys() { return []; }
      async del() { return 0; }
    }
  };
});

// 🔥 MOCK THE EVENT BROKER: The API publishes registrations through EventBrokerService,
// whose constructor opens a RabbitMQ connection and schedules a reconnection timer every
// 5 seconds when the broker is down. Replacing the class keeps the suite independent of
// Docker and lets Jest exit without open handles.
const publishEventMock = jest.fn<(action: string, data: object) => Promise<boolean>>();
jest.unstable_mockModule('../src/services/EventBrokerService.js', () => {
  return {
    EventBrokerService: class {
      publishEvent = publishEventMock;
      registerSSEClient = jest.fn();
    }
  };
});

// 🐘 MOCK THE POSTGRESQL REPOSITORY: createApp() awaits userRepository.initialize(),
// which would open a real connection pool. The routes receive the mock service below,
// so the repository only needs to exist and resolve without touching the network.
jest.unstable_mockModule('../src/repositories/UserRepository.js', () => {
  return {
    UserRepository: class {
      async initialize() {}
      async findAll() { return []; }
      async findById() { return null; }
      async findByEmail() { return null; }
      async create(user: User) { return user; }
    }
  };
});

// 🐇 MOCK THE AMQP DRIVER: Only the legacy blueprint (rabbit-deprecated.ts) imports
// 'amqplib' directly now. The fake connection and channel record calls instead of
// opening TCP sockets to a broker.
const fakeChannel = {
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
const { settings } = await import('../src/config.js');

// 3. LEGACY BLUEPRINT IMPORTS: The API never imports these modules (see README.md,
// "Architectural Evolution"). They are loaded here only to test them in isolation.
const rabbitModule = await import('../src/queue/rabbit-deprecated.js');
const socketModule = await import('../src/graphql/socket-deprecated.js');
const workerModule = await import('../src/worker-deprecated.js');

describe('User routes (integration tests)', () => {
  let serverTarget: http.Server;
  let tokenAdmin: string;

  // 🔑 TEST ACCOUNT: POST /auth/login now looks the account up by e-mail and compares the
  // password with bcrypt. The password is random per run and its hash is built in beforeAll.
  const ADMIN_EMAIL = 'admin@maestro.test';
  const ADMIN_PASSWORD = crypto.randomUUID();
  let adminPasswordHash = '';

  // 🏭 SERVICE MOCK: Create a simple object with the same methods as the real UserService.
  const mockUserService = {
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
    // Return the stored hash only for the test administrator, like the PostgreSQL lookup would.
    getUserByEmail: jest.fn<(email: string) => Promise<User | null>>(async (email) => {
      if (email !== ADMIN_EMAIL) return null;
      return { id: 'admin-id', name: 'Maestro Admin', email, password: adminPasswordHash };
    })
  };

  beforeAll(async () => {
    // Cost factor 4 is the bcrypt minimum; it keeps the suite fast and is used only in tests.
    adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);

    // 🔥 DYNAMIC INJECTION: Capture the HTTP server instance and inject the mock service.
    serverTarget = await createApp(mockUserService);

    // Log in through the real route and capture a valid JWT for the protected routes.
    const response = await request(serverTarget)
      .post('/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    tokenAdmin = response.body.token;
  });

  // TEST 1: Verify that a correct e-mail and password produce a signed JWT.
  // Condition: The mock returns the administrator with a bcrypt hash of the sent password.
  it('POST /auth/login -> returns 200 and a JWT when the credentials are valid', async () => {
    const response = await request(serverTarget)
      .post('/auth/login')
      .send({ username: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe('string');
  });

  // TEST 2: Verify that a wrong password returns the generic 401 error (no user enumeration).
  // Condition: The e-mail exists, but bcrypt.compare fails for the sent password.
  it('POST /auth/login -> returns 401 when the password is wrong', async () => {
    const response = await request(serverTarget)
      .post('/auth/login')
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
  it('GET /users -> returns 401 when no JWT is sent', async () => {
    const response = await request(serverTarget).get('/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // TEST 5: Verify a successful authenticated request.
  // Condition: Send a valid JWT and pagination parameters, then expect a user list.
  it('GET /users -> returns 200 and the paginated user list with a valid JWT', async () => {
    const response = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: 5, offset: 0 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // TEST 6: Verify a successful lookup by ID.
  // Condition: Send an existing user ID with a valid JWT and expect the mapped object.
  it('GET /users/:id -> returns 200 and the matching user when the ID exists', async () => {
    const response = await request(serverTarget)
      .get('/users/abc-777')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('abc-777');
    expect(response.body.name).toBe('Lucas Buscado');
  });

  // TEST 7: Verify that a missing ID returns HTTP 404.
  // Condition: The mock returns null for ID "999", so the controller should return 404 (Not Found).
  it('GET /users/:id -> returns 404 when the user does not exist', async () => {
    const response = await request(serverTarget)
      .get('/users/999')
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
  // Condition: A fresh app accepts exactly settings.rateLimits.login.max attempts; the next one gets 429.
  it('POST /auth/login -> returns 429 after the configured number of attempts', async () => {
    // A new app instance has its own limiter counters, so the logins in the tests above do not count.
    const freshServer = await createApp(mockUserService);
    const attempt = () => request(freshServer)
      .post('/auth/login')
      .send({ username: ADMIN_EMAIL, password: 'wrong-password' });

    for (let i = 0; i < settings.rateLimits.login.max; i++) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('AUTH_FLOOD_DETECTED');
  });

  // TEST 11: Verify GET /users rejects pagination that breaks the listUsersSchema rules.
  // Condition: Non-numeric, fractional, zero, negative and above-the-cap values never reach the service.
  it('GET /users -> returns 400 when limit or offset is not a whole number in range', async () => {
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
        .get('/users')
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
  it('GET /users -> passes the cap and the default page to the service as numbers', async () => {
    mockUserService.getAllUsers.mockClear();

    const atCap = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: settings.pagination.maxLimit, offset: 20 });
    const withoutQuery = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(atCap.status).toBe(200);
    expect(withoutQuery.status).toBe(200);
    expect(mockUserService.getAllUsers).toHaveBeenNthCalledWith(1, { limit: settings.pagination.maxLimit, offset: 20 });
    expect(mockUserService.getAllUsers).toHaveBeenNthCalledWith(2, { limit: settings.pagination.defaultLimit, offset: 0 });
  });

});

describe('Legacy cloud blueprint (deprecated modules, isolated from the API)', () => {
  const secret = process.env.JWT_SECRET as string;

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
    expect(fakeChannel.assertQueue).toHaveBeenCalledWith('user_events', { durable: true });
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
    const authenticate = socketModule.createHandshakeAuthenticator(secret);

    const missingNext = jest.fn();
    authenticate({ handshake: { auth: {} }, data: {} } as never, missingNext);
    expect(missingNext).toHaveBeenCalledWith(expect.any(Error));

    const forgedNext = jest.fn();
    authenticate({ handshake: { auth: { token: 'forged.token.value' } }, data: {} } as never, forgedNext);
    expect(forgedNext).toHaveBeenCalledWith(expect.any(Error));

    const validSocket = {
      handshake: { auth: { token: jwt.sign({ id: 'admin-id' }, secret, { expiresIn: '1m' }) } },
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
    const createUser = jest.fn<(name: string, email: string, password?: string) => Promise<User>>(async (name, email) => ({
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

    await workerModule.processUserEventMessage(channel as never, message as never, { createUser } as never);

    expect(createUser).toHaveBeenCalledWith('Lucas Fila', 'lucas.fila@maestro.com', passwordHash);
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
    const createUser = jest.fn();
    const channel = { ack: jest.fn(), nack: jest.fn() };
    const brokenJson = { content: Buffer.from('{not-json') };
    const invalidUser = {
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lu', email: 'email_invalido', password: '123' }
      }))
    };

    await workerModule.processUserEventMessage(channel as never, brokenJson as never, { createUser } as never);
    await workerModule.processUserEventMessage(channel as never, invalidUser as never, { createUser } as never);

    expect(createUser).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenNthCalledWith(1, brokenJson, false, false);
    expect(channel.nack).toHaveBeenNthCalledWith(2, invalidUser, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
