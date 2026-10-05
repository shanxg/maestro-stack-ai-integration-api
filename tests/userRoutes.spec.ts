// 🔥 REQUISITO DE INFRAESTRUTURA: Força o carregamento do arquivo .env na memória do teste
import 'dotenv/config';

// 1. IMPORTAÇÕES DE ESCOPO: Puxamos as diretivas do Jest e o robô Supertest
import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import request from 'supertest';

// 🚀 BLOCO DE INTERCEPTAÇÃO GLOBAL (CORTA CONEXÕES TCP DO REDIS):
// Toda vez que qualquer arquivo (inclusive o UserController) tentar dar 'new Redis()',
// o Jest entregará este dublê de memória ultra-rápido, eliminando os timeouts de rede!
jest.unstable_mockModule('ioredis', () => {
  return {
    Redis: class {
      async get() { return null; } // Simula um Cache Miss instantâneo
      async set() { return 'OK'; }
      async keys() { return []; }
      async del() { return 0; }
    }
  };
});

// 2. IMPORTAÇÃO DA FACTORY: Trazemos a fábrica modular do nosso aplicativo
const { createApp } = await import('../src/app.js');

describe('Rotas de Usuários (Testes de Integração)', () => {
  let serverTarget: any;
  let tokenAdmin: string;

  beforeAll(async () => {
    // 🏭 DUBLE DE SERVIÇO (MOCK): Criamos um objeto simples com as mesmas funções do UserService real
    const mockUserService = {
      createUser: jest.fn().mockResolvedValue({
        id: 'mock-id-123',
        name: 'Lucas Integrado',
        email: 'lucas@integrado.com'
      } as never),
      getAllUsers: jest.fn().mockResolvedValue([
        { id: '1', name: 'Lucas Integrado', email: 'lucas@integrado.com' }
      ] as never),
      getUserById: jest.fn().mockResolvedValue({
        id: '1',
        name: 'Lucas Integrado',
        email: 'lucas@integrado.com'
      } as never)
    };

    // 🔥 INJEÇÃO DINÂMICA: Captura a instância resolvida do servidor HTTP
    serverTarget = await createApp(mockUserService);

    // Realiza o login real simulado passando o server para capturar o token JWT válido
    const response = await request(serverTarget)
      .post('/auth/login')
      .send({ username: 'admin', password: 'secret123' });

    tokenAdmin = response.body.token;
  });

  afterAll(async () => {
    // Importamos dinamicamente e fechamos os ouvintes de WebSocket para liberar o terminal com elegância
    const { io } = await import('../src/graphql/socket.js');
    if (io) {
      io.close();
    }
    // Dá uma pequena folga de milissegundos para o Node esvaziar a pilha de eventos (Event Loop)
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // TESTE 1: Valida se a barreira do Zod bloqueia payloads vazios ou mal formatados
  it('POST /users -> deve retornar status 400 se o corpo da requisição falhar na validação do Zod', async () => {
    const response = await request(serverTarget)
      .post('/users')
      .send({ name: 'Lu', email: 'email_invalido' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
    expect(response.body.error.details).toBeDefined();
  });

  // TESTE 2: Valida se o authMiddleware barra requisições que não enviam as credenciais
  it('GET /users -> deve retornar status 401 se tentar acessar a rota sem enviar o token JWT', async () => {
    const response = await request(serverTarget).get('/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // TESTE 3: Sucesso absoluto controlado em milissegundos!
  it('GET /users -> deve retornar status 200 e a lista paginada de usuários ao enviar token JWT válido', async () => {
    const response = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: 5, offset: 0 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
