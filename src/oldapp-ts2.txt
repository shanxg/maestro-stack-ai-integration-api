// 🔥 REQUISITO MÁXIMO DE SEGURANÇA: Inicializa o dotenv na linha 1 para carregar o arquivo .env para a memória da API
import 'dotenv/config';

// 1. IMPORTAÇÕES DE INFRAESTRUTURA E ECOSSISTEMA EXPRESS
import express, {type Request, type Response} from 'express';
import jwt from 'jsonwebtoken'; // 👈 IMPORTAÇÃO ADICIONADA para assinar os tokens de autenticação
import fs from 'node:fs'; // 👈 IMPORTAÇÃO ADICIONADA para ler o arquivo .graphql fisicamente do disco
import path from 'node:path'; // 👈 IMPORTAÇÃO ADICIONADA para resolver caminhos de pastas de forma segura
import http from 'node:http'; // 👈 IMPORTAÇÃO ADICIONADA: Módulo nativo do Node para gerenciar servidores de rede
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';
import { UserController } from './controllers/UserController.js';
// 🔥 INTEGRAÇÃO DE INTELIGÊNCIA ARTIFICIAL
import { AIService } from './services/AIService.js';
import { AIController } from './controllers/AIController.js';

// 2. IMPORTAÇÕES DOS PACOTES DE SEGURANÇA (OWASP TOP 10)
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// 3. IMPORTAÇÕES DOS NOSSOS NOVOS MIDDLEWARES E SCHEMAS
import { authMiddleware } from './middlewares/authMiddleware.js';
import { validateMiddleware } from './middlewares/validateMiddleware.js';
import { createUserSchema } from './schemas/userSchema.js';

// 4. 🔥 IMPORTAÇÕES DO BLOCO GRAPHQL (APOLLO SERVER)
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { userResolvers } from './graphql/userResolvers.js';

// 5. 🔥 IMPORTAÇÃO DA ARQUITETURA LIMPA DE TEMPO REAL
import { initializeSocket } from './graphql/socket.js'; // 👈 IMPORTAÇÃO ADICIONADA para carregar o inicializador do WebSocket

// 🔥 RECUPERAÇÃO SEGURA: Captura a chave secreta direto da memória do ambiente (com fallback de segurança caso venha vazia)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_backup_2026';

// 🔥 REVOLUÇÃO ARQUITETURAL (FACTORY FUNCTION - INSPIRAÇÃO EM ARQUITETURA ANDROID):
// Envelopamos a montagem do servidor em uma função assíncrona. Se o arquivo de testes do Jest passar um
// 'customUserService' (o mock), o Express adotará ele dinamicamente, cortando loops com o RabbitMQ/Redis real!
export async function createApp(customUserService?: any) {

  const app = express();

  // 🔥 ENVELOPAMENTO DE REDE: Criamos o servidor HTTP unificado do Node injetando o Express dentro dele
  const server = http.createServer(app);
  // 🔥 INICIALIZAÇÃO DO WEBSOCKET ISOLADO: Aciona a função do socket.ts injetando o nosso servidor HTTP unificado
  initializeSocket(server);

  // ==========================================
  // 🔥 MIDDLEWARES DE PROTEÇÃO GLOBAL
  // ==========================================

  // A. HELMET: Configura cabeçalhos HTTP robustos para mitigar ataques como Clickjacking e XSS
  // BOA PRÁTICA DE MERCADO: Desativamos a política de conteúdo (CSP) apenas localmente para que o Apollo Sandbox funcione 100%.
  const helmetOptions =
    process.env.NODE_ENV === 'production'
      ? {}
      : { contentSecurityPolicy: false };
  app.use(helmet(helmetOptions));

  // B. CORS: Restringe quais origens web externas podem consumir os dados da sua API
  app.use(cors({ 
    origin: 'http://localhost:3000', // Libera estritamente o seu front-end local de estudos
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // C. RATE LIMIT: Protege o servidor contra ataques DDoS limitando requisições abusivas por IP
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Janela de contagem de 15 minutos
    max: 100, // Cada IP individual pode realizar no máximo 100 requisições dentro desse intervalo
    standardHeaders: true, // Adiciona os cabeçalhos padrão de monitoramento no response
    legacyHeaders: false, // Desabilita os cabeçalhos antigos e legados X-RateLimit-*
    message: {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Você atingiu o limite máximo de requisições. Tente novamente em 15 minutos.'
      }
    }
  });

  // Acopla a barreira protetora contra força bruta em todas as rotas do Express
  app.use(limiter);

  // Ativa o middleware nativo que intercepta e lê payloads em formato JSON
  app.use(express.json());

  // ==========================================
  // 🏭 INJEÇÃO DE DEPENDÊNCIAS (FACTORY PATTERN)
  // ==========================================
  // MUDANÇA SÊNIOR: Se receber um serviço mockado por parâmetro, injeta ele no controlador.
  // Caso contrário (ambiente real), ele instancia a esteira original conectada à infraestrutura viva!
  const userRepository = new UserRepository();
  const userService = customUserService || new UserService(userRepository);

  function makeUserController(): UserController {
    return new UserController(userService);
  }

  const userController = makeUserController();

  // =========================================================================
  // 🔐 ENDPOINT DE AUTENTICAÇÃO: POST /auth/login
  // =========================================================================
  // Rota responsável por receber as credenciais, validar a identidade e emitir o token JWT.
  app.post('/auth/login', (req: Request, res: Response): void => {
    
    // 1. EXTRAÇÃO DE DADOS: Captura o nome de usuário e a senha enviados pelo cliente no corpo da requisição.
    const { username, password } = req.body;

    // 2. SIMULAÇÃO DE BANCO DE DADOS (MOCK): Verifica se as credenciais batem com o usuário de testes do tutorial.
    // IMPORTANTE: Em um ambiente real de produção, buscaríamos esses dados criptografados com bcrypt no banco de dados.
    if (username === 'admin' && password === 'secret123') {
      
      // 3. GERAÇÃO DO TOKEN JWT: Cria e assina digitalmente um token contendo o payload (dados do usuário logado).
      // - Argumento 1: Payload contendo informações públicas que queremos embutir no token (username e cargo/role).
      // - Argumento 2: A nossa chave secreta unificada (JWT_SECRET) carregada de forma segura do arquivo .env.
      // - Argumento 3: Objeto de configurações, definindo que o token expira automaticamente em 1 hora (TTL).
      const token = jwt.sign(
        { user: username, role: 'ADMIN' }, 
        JWT_SECRET, 
        { expiresIn: '1h' }
      );

      // 4. RESPOSTA DE SUCESSO: Devolve o token gerado em formato JSON para que o cliente guarde no localStorage.
      res.json({ token });
      return;
    }

    // 5. RESPOSTA DE FALHA DE AUTENTICAÇÃO: Se as credenciais estiverem erradas, barra o login com o status HTTP 401 (Unauthorized).
    // Retorna o objeto de erro envelopado seguindo rigorosamente o padrão unificado da OWASP exigido no cronograma.
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Credenciais inválidas. Usuário ou senha incorretos.'
      }
    });
  });

  // ==========================================
  // 🛣️ MAPEAMENTO DE ENDPOINTS REST MAESTRO
  // ==========================================
  // AJUSTE DE ESCOPO: Passamos funções de callback explícitas preservando o contexto das requisições.
  app.get('/users', authMiddleware, (req: Request, res: Response) => userController.getUsers(req, res));       // Rota para listar todos os usuários de forma paginada
  app.get('/users/:id', authMiddleware, (req: Request, res: Response) => userController.getUserById(req, res)); // Rota para buscar um usuário pelo ID único
  app.post('/users', validateMiddleware(createUserSchema), (req: Request, res: Response) => userController.createUser(req, res));     // Rota para cadastrar um novo usuário na fila assíncrona

  // ==========================================
  // 🏭 INICIALIZAÇÃO DA INTELIGÊNCIA ARTIFICIAL (DIA 6)
  // ==========================================
  const aiService = new AIService();
  const aiController = new AIController(aiService);

  // 📝 CONDIÇÃO TESTADA: Rota POST /ai/chat protegida por Firewall JWT
  // O tráfego bate primeiro no authMiddleware; se o token for inválido ou ausente, é barrado com 401.
  // Se passar, o AIController valida o payload e despacha o prompt para o Llama 3 no disco D.
  app.post('/ai/chat', authMiddleware, (req, res) => aiController.chat(req, res));


  // =========================================================================
  // 📡 🔥 ENDPOINT DE TEMPO REAL: SERVER-SENT EVENTS (SSE) - GET /events
  // =========================================================================
  // Canal de streaming unidirecional ideal para disparar notificações leves diretamente para o navegador
  app.get('/events', (req: Request, res: Response): void => {
    // Configura os cabeçalhos HTTP necessários para manter o túnel de streaming aberto indefinidamente
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Declaramos a variável do intervalo tipada corretamente pelo Node.js
    let interval: NodeJS.Timeout | undefined;

    // 🔥 VALIDAÇÃO DEFENSIVA: Só dispara o loop infinito de batimento cardíaco se NÃO estivermos rodando testes!
    if (process.env.NODE_ENV !== 'test') {
      interval = setInterval(() => {
        res.write(`data: ${JSON.stringify({ timestamp: Date.now(), msg: 'Keep-alive Maestro' })}\n\n`);
      }, 5000);
    }

    // Escuta o encerramento do cliente (quando fecha a aba) para limpar o loop da memória RAM do servidor
    req.on('close', () => {
      if (interval) {
        clearInterval(interval);
      }
      console.log('🔌 Conexão SSE de notificações encerrada pelo cliente.');
    });
  });


  // ==========================================
  // 🌌 🔥 CONFIGURAÇÃO E INICIALIZAÇÃO DO GRAPHQL
  // ==========================================

  // Passo A: Lê as definições de tipo do arquivo schema.graphql convertendo o arquivo físico em string
  const typeDefs = fs.readFileSync(
    path.resolve('src', 'graphql', 'schema.graphql'),
    'utf-8'
  );

  // Passo B: Instancia o motor do Apollo Server passando as definições de tipo e os resolvers correspondentes
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers: userResolvers,
  });

 // 🔥 CORREÇÃO CIRÚRGICA DE CONCORRÊNCIA ESM:
 // Só damos a partida no Apollo se NÃO estivermos no ambiente de testes do Jest!
 // Isso impede o congelamento do Express e zera os vazamentos de processos abertos (Open Handles).
 if (process.env.NODE_ENV !== 'test') {

    // Passo C: Função assíncrona imediata para dar partida no Apollo antes de acoplá-lo nas rotas do Express
    await apolloServer.start();

    // Passo D: Vincula o Apollo Server na rota única '/graphql' usando o expressMiddleware nativo
    app.use('/graphql', expressMiddleware(apolloServer));
 } 
  
  // ==========================================
  // 🚀 INICIALIZAÇÃO DO SERVIDOR
  // ==========================================
  const PORT = Number(process.env.PORT) || 3000;
  // 🔥 MUDANÇA CRUCIAL DE ARQUITETURA: Mudamos de app.listen para server.listen para ligar os canais WebSocket na porta!
  if (process.env.NODE_ENV === 'test') {
    console.log("⚠️ Modo de Testes Ativado: O servidor HTTP não será iniciado para evitar conflitos de porta.");
  }else {
    // 🌐 CORREÇÃO CIRÚRGICA: Adicionado "0.0.0.0" para que o Pod aceite conexões vindas de fora do contêiner!
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 API REST, GraphQL & WebSockets rodando com segurança em http://localhost:${PORT}`);
        console.log(`🌌 Sandbox do GraphQL ativo em http://localhost:${PORT}/graphql`);
        console.log(`📡 Canal de notificações SSE ativado em http://localhost:${PORT}/events`);
    });
  }

  return server; // Retorna o app, server e apolloServer para testes e manipulação externa
}
