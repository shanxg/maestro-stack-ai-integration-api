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
      async get() { return null; } // Simula um Cache Miss instantâneo para forçar a rota a ler o serviço
      async set() { return 'OK'; }
      async keys() { return []; }
      async del() { return 0; }
    }
  };
});

// 🔥 NOVO MOCK ADICIONADO: Intercepta o driver do RabbitMQ para evitar o erro ECONNREFUSED!
// Corta a conexão física de rede e entrega um canal simulado em memória instantaneamente.
jest.unstable_mockModule('../src/queue/rabbit.js', () => {
  return {
    QUEUE_NAME: 'user_events',
    getRabbitChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      sendToQueue: jest.fn(), // Permite que a função do controlador envie o Buffer sem travar
    } as never)
  };
});

// 2. IMPORTAÇÃO DA FACTORY: Trazemos a fábrica modular do nosso aplicativo
const { createApp } = await import('../src/app.js');

describe('Rotas de Usuários (Testes de Integração)', () => {
  let serverTarget: any;
  let tokenAdmin: string;

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
    // CONDIÇÃO DE MOCK CONDICIONAL: Se o ID for '999', o serviço retorna null para simular um usuário inexistente
    getUserById: jest.fn<
    (id: string) => Promise<{ id: string; name: string; email: string } | null>
    >(async (id) => {
        if (id === '999') return null;
        return { id, name: 'Lucas Buscado', email: 'lucas@busca.com' };
    })
  };

  beforeAll(async () => {
    // 🔥 INJEÇÃO DINÂMICA: Captura a instância resolvida do servidor HTTP passando o serviço falso purificado
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
  // CONDIÇÃO TESTADA: Envio de payload inválido direto na raiz da rota (sem envelopamento adequado do body) para forçar falha imediata no middleware
  it('POST /users -> deve retornar status 400 se o corpo da requisição falhar na validação do Zod', async () => {
    const response = await request(serverTarget)
      .post('/users')
      .send({ name: 'Lu', email: 'email_invalido' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILURE');
    expect(response.body.error.details).toBeDefined();
  });

  // TESTE 2: Valida se o authMiddleware barra requisições que não enviam as credenciais
  // CONDIÇÃO TESTADA: Tentativa de acesso anônimo sem passar o cabeçalho "Authorization" com o Bearer Token
  it('GET /users -> deve retornar status 401 se tentar acessar a rota sem enviar o token JWT', async () => {
    const response = await request(serverTarget).get('/users');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  // TESTE 3: Sucesso absoluto controlado em milissegundos!
  // CONDIÇÃO TESTADA: Envio de credenciais JWT corretas e parâmetros válidos via Query String (?limit=5&offset=0) esperando retorno de listagem
  it('GET /users -> deve retornar status 200 e a lista paginada de usuários ao enviar token JWT válido', async () => {
    const response = await request(serverTarget)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .query({ limit: 5, offset: 0 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // TESTE 4: Busca por ID específico com sucesso
  // CONDIÇÃO TESTADA: Envio de um ID de usuário válido e existente acompanhado do token JWT correto, esperando receber o objeto mapeado
  it('GET /users/:id -> deve retornar status 200 e o usuário correspondente se o ID for válido', async () => {
    const response = await request(serverTarget)
      .get('/users/abc-777')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('abc-777');
    expect(response.body.name).toBe('Lucas Buscado');
  });

  // TESTE 5: Busca por ID inexistente gerando erro 404
  // CONDIÇÃO TESTADA: Envio do ID "999" (mapeado no mock para retornar null) esperando o tratamento do controlador disparar status 404 (Not Found)
  it('GET /users/:id -> deve retornar status 404 se o usuário não for encontrado no repositório', async () => {
    const response = await request(serverTarget)
      .get('/users/999')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  // TESTE 6: Cadastro assíncrono bem-sucedido na fila do RabbitMQ
  // CONDIÇÃO TESTADA: Envio de payload envelopado corretamente dentro de "body" atendendo 100% às exigências estruturais do Zod Schema
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

  // TESTE 7: Falha de validação do Zod estrutural no corpo envelopado
  // CONDIÇÃO TESTADA: Envio de objeto envelopado em "body", mas violando as regras internas de tamanho de nome (min 3) e formato de e-mail do Zod
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
