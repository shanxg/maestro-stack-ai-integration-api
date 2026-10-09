// 🔥 SECURITY REQUIREMENT: Load dotenv on the first line to read .env into API memory.
import 'dotenv/config';

// 1. INFRASTRUCTURE AND EXPRESS IMPORTS
import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken'; // Sign and issue authentication tokens
import fs from 'node:fs';       // Native module for reading files from disk
import path from 'node:path';   // Native module for safely resolving directory paths
import http from 'node:http';   // Node module for managing network servers

// User domain layers
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';
import { UserController } from './controllers/UserController.js';

// 🔥 UNIFIED MESSAGING AND REAL-TIME SUPPORT (DAY 7)
// Import the unified service that manages RabbitMQ queues and SSE streaming connections.
import { EventBrokerService } from './services/EventBrokerService.js';

// Local AI domain layers
import { AIService } from './services/AIService.js';
import { AIController } from './controllers/AIController.js';

// 2. GLOBAL SECURITY PACKAGE IMPORTS (OWASP TOP 10)
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// 3. MIDDLEWARE AND ZOD SCHEMA IMPORTS
import { authMiddleware } from './middlewares/authMiddleware.js';
import { validateMiddleware } from './middlewares/validateMiddleware.js';
import { createUserSchema } from './schemas/userSchema.js';

// 4. GRAPHQL (APOLLO SERVER) IMPORTS
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { userResolvers } from './graphql/userResolvers.js';

// Safely read the JWT secret from the environment, with a fallback value.
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_backup_2026';

/**
 * 🏭 APPLICATION FACTORY (createApp):
 * Assembles the API and lets Jest inject service mocks,
 * so tests can run quickly without blocking on external services.
 */
export async function createApp(customUserService?: any) {

  const app = express();

  // Create a native HTTP server around the Express application.
  const server = http.createServer(app);

  // ==========================================
  // 🛡️ NETWORK PROTECTION MIDDLEWARE
  // ==========================================

  // A. HELMET: Set strict HTTP headers to mitigate clickjacking, sniffing, and XSS.
  // Disable CSP locally to allow the Apollo Sandbox to run.
  const helmetOptions = process.env.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false };
  app.use(helmet(helmetOptions));

  // B. CORS: Restrict request origins to traffic from the Next.js frontend.
  app.use(cors({ 
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Support both local ports
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // C. RATE LIMITER: Protect the API from malicious request floods (DDoS).
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15-minute counting window
    max: 100,                 // Allow at most 100 requests per IP per window
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

  // Enable native parsing of JSON request bodies.
  app.use(express.json());

  // ==========================================
  // 🏭 SERVICE INITIALIZATION AND WIRING (IoC)
  // ==========================================
  // Create the centralized messaging broker.
  const eventBrokerService = new EventBrokerService();

  // Wire the user workflow to PostgreSQL persistence. [66]
  const userRepository = new UserRepository();
  const userService = customUserService || new UserService(userRepository);
  
  // 🔥 Inject both dependencies required by UserController. [20]
  const userController = new UserController(userService, eventBrokerService);

  // ==========================================
  // 🔐 AUTHENTICATION ENDPOINT: POST /auth/login
  // ==========================================
  app.post('/auth/login', (req: Request, res: Response): void => {
    const { username, password } = req.body;

    // Stable demo credentials for issuing tokens. [60]
    if (username === 'admin' && password === 'secret123') {
      const token = jwt.sign(
        { user: username, role: 'ADMIN' }, 
        JWT_SECRET, 
        { expiresIn: '1h' } // One-hour token lifetime
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
  // 🗺️ MAESTRO REST ENDPOINTS
  // ==========================================
  app.get('/users', authMiddleware, (req: Request, res: Response) => userController.getUsers(req, res));
  app.get('/users/:id', authMiddleware, (req: Request, res: Response) => userController.getUserById(req, res));
  app.post('/users', validateMiddleware(createUserSchema), (req: Request, res: Response) => userController.createUser(req, res));

  // ==========================================
  // 🤖 AI ORCHESTRATION
  // ==========================================
  const aiService = new AIService();
  const aiController = new AIController(aiService);
  app.post('/ai/chat', authMiddleware, (req, res) => aiController.chat(req, res));

  // ==========================================
  // 📡 🔥 REAL-TIME ENDPOINT: SERVER-SENT EVENTS (SSE)
  // ==========================================
  // 🔥 Route directly through the broker's registerSSEClient method.
  // Turn a standard HTTP connection into a reactive stream connected to the queue.
  app.get('/events', (req: Request, res: Response) => {
    eventBrokerService.registerSSEClient(req, res);
  });

  // ==========================================
  // 🌌 GRAPHQL CONFIGURATION AND INITIALIZATION
  // ==========================================
  const typeDefs = fs.readFileSync(path.resolve('src', 'graphql', 'schema.graphql'), 'utf-8');
  const apolloServer = new ApolloServer({ typeDefs, resolvers: userResolvers });

  if (process.env.NODE_ENV !== 'test') {
    await apolloServer.start();
    app.use('/graphql', expressMiddleware(apolloServer));
  } 
  
  // ==========================================
  // 🚀 UNIVERSAL HTTP SERVER STARTUP
  // ==========================================
  const PORT = Number(process.env.PORT) || 3000;
  
  if (process.env.NODE_ENV === 'test') {
    console.log("⚠️ Modo de Testes Ativado: O servidor HTTP não será iniciado para evitar conflitos de porta.");
  } else {
    // Listen on 0.0.0.0 to accept Kubernetes traffic. [70]
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 API REST, GraphQL & Notificações SSE rodando com segurança em http://localhost:${PORT}`);
        console.log(`🌌 Sandbox do GraphQL ativo em http://localhost:${PORT}/graphql`);
        console.log(`📡 Canal de notificações em tempo real SSE ativo em http://localhost:${PORT}/events`);
    });
  }

  return server;
}
