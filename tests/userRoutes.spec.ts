// 🔥 INFRASTRUCTURE REQUIREMENT: Load .env into the test environment.
import 'dotenv/config';

// 1. IMPORTS: Bring in Jest utilities and Supertest.
import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import request from 'supertest';

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

// 🔥 MOCK RABBITMQ: Intercept the driver to avoid ECONNREFUSED errors.
// Replace the network connection with an in-memory channel.
jest.unstable_mockModule('../src/queue/rabbit.js', () => {
  return {
    QUEUE_NAME: 'user_events',
    getRabbitChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      sendToQueue: jest.fn(), // Allow the controller to send the buffer without blocking
    } as never)
  };
});

// 2. FACTORY IMPORT: Bring in the modular application factory.
const { createApp } = await import('../src/app.js');

describe('Rotas de Usuários (Testes de Integração)', () => {
  let serverTarget: any;
  let tokenAdmin: string;

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
    getUserById: jest.fn<
    (id: string) => Promise<{ id: string; name: string; email: string } | null>
    >(async (id) => {
        if (id === '999') return null;
        return { id, name: 'Lucas Buscado', email: 'lucas@busca.com' };
    })
  };

  beforeAll(async () => {
    // 🔥 DYNAMIC INJECTION: Capture the HTTP server instance and inject the mock service.
    serverTarget = await createApp(mockUserService);

    // Simulate login through the server and capture a valid JWT.
    const response = await request(serverTarget)
      .post('/auth/login')
      .send({ username: 'admin', password: 'secret123' });

    tokenAdmin = response.body.token;
  });

  afterAll(async () => {
    // Dynamically import and close WebSocket listeners to release the terminal cleanly.
    const { io } = await import('../src/graphql/socket.js');
    if (io) {
      io.close();
    }
    // Give Node a moment to drain the event loop.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // TEST 1: Verify that Zod rejects empty or malformed payloads.
  // Condition: Send an invalid payload without the expected body envelope to trigger middleware validation.
  it('POST /users -> deve retornar status 400 se o corpo da requisição falhar na validação do Zod', async () => {
    const response = await request(serverTarget)
      .post('/users')
      .send({ name: 'Lu', email: 'email_invalido' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
    expect(response.body.error.details).toBeDefined();
  });

  // TEST 2: Verify that authMiddleware rejects requests without credentials.
  // Condition: Attempt anonymous access without an Authorization Bearer token.
  it('GET /users -> deve retornar status 401 se tentar acessar a rota sem enviar o token JWT', async () => {
    const response = await request(serverTarget).get('/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // TEST 3: Verify a successful authenticated request.
  // Condition: Send a valid JWT and pagination parameters, then expect a user list.
  it('GET /users -> deve retornar status 200 e a lista paginada de usuários ao enviar token JWT válido', async () => {
    const response = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: 5, offset: 0 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // TEST 4: Verify a successful lookup by ID.
  // Condition: Send an existing user ID with a valid JWT and expect the mapped object.
  it('GET /users/:id -> deve retornar status 200 e o usuário correspondente se o ID for válido', async () => {
    const response = await request(serverTarget)
      .get('/users/abc-777')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('abc-777');
    expect(response.body.name).toBe('Lucas Buscado');
  });

  // TEST 5: Verify that a missing ID returns HTTP 404.
  // Condition: The mock returns null for ID "999", so the controller should return 404 (Not Found).
  it('GET /users/:id -> deve retornar status 404 se o usuário não for encontrado no repositório', async () => {
    const response = await request(serverTarget)
      .get('/users/999')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  // TEST 6: Verify successful asynchronous registration through RabbitMQ.
  // Condition: Send a correctly enveloped payload that satisfies the Zod schema.
  it('POST /users -> deve retornar status 202 se o payload passar no Zod e for enfileirado com sucesso', async () => {
    const response = await request(serverTarget)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        
          name: 'Lucas Novo',
          email: 'lucas.novo@maestro.com'
        
      });

    expect(response.status).toBe(202);
    expect(response.body.message).toContain('Solicitação de cadastro recebida com sucesso!');
  });

  // TEST 7: Verify Zod rejects an invalid enveloped body.
  // Condition: Send a body that violates the minimum name length and email format rules.
  it('POST /users -> deve retornar status 400 se o corpo envelopado violar as regras de tamanho e e-mail do Zod Schema', async () => {
    const response = await request(serverTarget)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        
          name: 'Lu',
          email: 'email_invalido'
        
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
  });
});
