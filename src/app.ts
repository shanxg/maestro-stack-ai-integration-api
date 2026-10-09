// 🔥 REQUISITO MÁXIMO DE SEGURANÇA: Inicializa o dotenv na linha 1 para descarregar o arquivo .env para a memória da API
import 'dotenv/config';

// 1. IMPORTAÇÕES DE INFRAESTRUTURA E ECOSSISTEMA EXPRESS
import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken'; // Utilizado para assinar e emitir chaves de autenticação
import fs from 'node:fs';       // Módulo nativo para ler arquivos físicos do disco rígido
import path from 'node:path';   // Módulo nativo para resolver caminhos de pastas de forma segura
import http from 'node:http';   // Módulo nativo do Node para gerenciar a malha de servidores de rede

// Camadas estruturais do domínio de Usuários
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';
import { UserController } from './controllers/UserController.js';

// 🔥 UNIFICAÇÃO DE MENSAGERIA E TEMPO REAL (DIA 7)
// Trazemos o novo cérebro unificado que gerencia as filas do RabbitMQ e as conexões de streaming SSE
import { EventBrokerService } from './services/EventBrokerService.js';

// Camadas estruturais do domínio de Inteligência Artificial Local
import { AIService } from './services/AIService.js';
import { AIController } from './controllers/AIController.js';

// 2. IMPORTAÇÕES DOS PACOTES DE SEGURANÇA GLOBAL (OWASP TOP 10)
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// 3. IMPORTAÇÕES DOS NOSSOS MIDDLEWARES E SCHEMAS DO ZOD
import { authMiddleware } from './middlewares/authMiddleware.js';
import { validateMiddleware } from './middlewares/validateMiddleware.js';
import { createUserSchema } from './schemas/userSchema.js';

// 4. IMPORTAÇÕES DO BLOCO GRAPHQL (APOLLO SERVER)
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { userResolvers } from './graphql/userResolvers.js';

// Recuperação Segura: Captura o segredo do JWT direto do ambiente com fallback de contingência
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_backup_2026';

/**
 * 🏭 FACTORY FUNCTION DO ECOSSISTEMA ( createApp ):
 * Envelopa a montagem completa da API. Permite que o ambiente de testes do Jest injete
 * dublês de serviço (mocks) para rodar validações em milissegundos sem travar o terminal.
 */
export async function createApp(customUserService?: any) {

  const app = express();

  // Envelopamento de Rede: Criamos o servidor HTTP nativo acoplando as diretivas do Express
  const server = http.createServer(app);

  // ==========================================
  // 🛡️ MIDDLEWARES DE PROTEÇÃO DE REDE
  // ==========================================

  // A. HELMET: Ajusta cabeçalhos HTTP rigorosos contra Clickjacking, Sniffing e vetores de XSS.
  // Desativamos a política de conteúdo (CSP) localmente apenas para permitir a execução da Sandbox do Apollo.
  const helmetOptions = process.env.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false };
  app.use(helmet(helmetOptions));

  // B. CORS: Restringe a origem das chamadas. Libera estritamente o tráfego vindo do seu front Next.js.
  app.use(cors({ 
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Habilita suporte para as duas portas locais
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // C. RATE LIMITER: Protege o barramento contra inundações forçadas por scripts maliciosos (DDoS).
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Janela de contagem de 15 minutos
    max: 100,                 // Cada IP pode efetuar no máximo 100 requisições por janela
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Você atingiu o limite máximo de requisições toleradas. Aguarde 15 minutos.'
      }
    }
  });
  app.use(limiter);

  // Ativa a interceptação e leitura nativa de payloads em formato JSON no corpo das rotas
  app.use(express.json());

  // ==========================================
  // 🏭 INICIALIZAÇÃO E AMARRAÇÃO DOS SERVIÇOS (IoC)
  // ==========================================
  // Instanciamos o novo broker de mensageria centralizado do Dia 7
  const eventBrokerService = new EventBrokerService();

  // Orquestramos a esteira de Usuários acoplando a persistência relacional real do PostgreSQL [66]
  const userRepository = new UserRepository();
  const userService = customUserService || new UserService(userRepository);
  
  // 🔥 ATUALIZADO: Injeta as duas dependências necessárias no construtor do UserController! [20]
  const userController = new UserController(userService, eventBrokerService);

  // ==========================================
  // 🔐 ENDPOINT DE AUTENTICAÇÃO: POST /auth/login
  // ==========================================
  app.post('/auth/login', (req: Request, res: Response): void => {
    const { username, password } = req.body;

    // Simulação estável corporativa para emissão de chaves [60]
    if (username === 'admin' && password === 'secret123') {
      const token = jwt.sign(
        { user: username, role: 'ADMIN' }, 
        JWT_SECRET, 
        { expiresIn: '1h' } // TTL de 1 hora de validade ativa
      );
      res.status(200).json({ token });
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas. Usuário ou senha incorretos.'
      }
    });
  });

  // ==========================================
  // 🗺️ MAPEAMENTO DE ENDPOINTS REST MAESTRO
  // ==========================================
  app.get('/users', authMiddleware, (req: Request, res: Response) => userController.getUsers(req, res));
  app.get('/users/:id', authMiddleware, (req: Request, res: Response) => userController.getUserById(req, res));
  app.post('/users', validateMiddleware(createUserSchema), (req: Request, res: Response) => userController.createUser(req, res));

  // ==========================================
  // 🤖 ORQUESTRAÇÃO DE INTELIGÊNCIA ARTIFICIAL
  // ==========================================
  const aiService = new AIService();
  const aiController = new AIController(aiService);
  app.post('/ai/chat', authMiddleware, (req, res) => aiController.chat(req, res));

  // ==========================================
  // 📡 🔥 ENDPOINT DE TEMPO REAL: SERVER-SENT EVENTS (SSE)
  // ==========================================
  // 🔥 ATUALIZADO: Rota acoplada diretamente ao registerSSEClient do nosso Broker!
  // Transforma a conexão HTTP comum em um canal de transmissão reativo unificado à fila.
  app.get('/events', (req: Request, res: Response) => {
    eventBrokerService.registerSSEClient(req, res);
  });

  // ==========================================
  // 🌌 CONFIGURAÇÃO E INICIALIZAÇÃO DO GRAPHQL
  // ==========================================
  const typeDefs = fs.readFileSync(path.resolve('src', 'graphql', 'schema.graphql'), 'utf-8');
  const apolloServer = new ApolloServer({ typeDefs, resolvers: userResolvers });

  if (process.env.NODE_ENV !== 'test') {
    await apolloServer.start();
    app.use('/graphql', expressMiddleware(apolloServer));
  } 
  
  // ==========================================
  // 🚀 INICIALIZAÇÃO DO SERVIDOR HTTP UNIVERSAL
  // ==========================================
  const PORT = Number(process.env.PORT) || 3000;
  
  if (process.env.NODE_ENV === 'test') {
    console.log("⚠️ Modo de Testes Ativado: O servidor HTTP não será iniciado para evitar conflitos de porta.");
  } else {
    // Escuta na interface universal 0.0.0.0 para aceitar os roteamentos elásticos do Kubernetes [70]
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 API REST, GraphQL & Notificações SSE rodando com segurança em http://localhost:${PORT}`);
        console.log(`🌌 Sandbox do GraphQL ativo em http://localhost:${PORT}/graphql`);
        console.log(`📡 Canal de notificações em tempo real SSE ativo em http://localhost:${PORT}/events`);
    });
  }

  return server;
}
