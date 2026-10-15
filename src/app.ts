import bcrypt from 'bcrypt'; // Slow-stretched password hashing and verification

// 1. INFRASTRUCTURE AND EXPRESS IMPORTS
import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken'; // Sign and issue authentication tokens
import fs from 'node:fs';       // Native module for reading files from disk
import path from 'node:path';   // Native module for safely resolving directory paths
import http from 'node:http';   // Node module for managing network servers
import crypto from 'node:crypto'; // CSPRNG for the throwaway value behind the dummy login hash

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
import { Redis } from 'ioredis'; // Client for the shared rate-limit counters

// 3. MIDDLEWARE, ZOD SCHEMA AND CONFIG IMPORTS
import { authMiddleware } from './middlewares/authMiddleware.js';
import { validateMiddleware } from './middlewares/validateMiddleware.js';
import { RedisRateLimitStore } from './middlewares/redisRateLimitStore.js';
import { createUserSchema, listUsersSchema } from './schemas/userSchema.js';
import { loginSchema } from './schemas/authSchema.js';
import { env, settings } from './config.js'; // Validated environment and fixed limits (also loads .env)

// 4. GRAPHQL (APOLLO SERVER) IMPORTS
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';

// ARCHITECTURAL REMEDIATION - PURGE MODULE-LEVEL SIDE EFFECTS
// Swapped out the static 'userResolvers' instantiation link for our clean dynamic factory function.
import { createUserResolvers } from './graphql/userResolvers.js';

// =========================================================================
// 🔐 CRYPTOGRAPHIC VAULT & ENVIRONMENT VALIDATION (CWE-798)
// =========================================================================
// src/config.ts validates the environment when it is imported and stops the boot
// if JWT_SECRET is missing or too short, so the API never runs in an insecure state.
const JWT_SECRET = env.JWT_SECRET;

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
  const helmetOptions = env.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false };
  app.use(helmet(helmetOptions));

  // B. CORS: Restrict request origins to traffic from the Next.js frontend.
  app.use(cors({ 
    origin: [
      'http://localhost:3000', 
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ], // Support both local ports
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Allow cookies and credentials to be sent
  }));
  
  // APPSEC REMEDIATION - GLOBAL OPTIONS PRE-FLIGHT INTERCEPTOR (OWASP TOP 10)
  // Forces the Express architecture to immediately resolve and return HTTP 204 (No Content)
  // to browser pre-flight handshake validations before they hit specific route validations.
  app.options('/*splat', (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(204);
  });
  
  // C. SHARED RATE-LIMIT COUNTERS (CWE-770): Kubernetes runs two API replicas, so the three
  // limiters below keep their counters in Redis (src/middlewares/redisRateLimitStore.ts).
  // Without an offline queue, commands fail at once while Redis is down, and the stores
  // switch to per-process memory counters instead of holding requests until Redis returns.
  const rateLimitRedis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // ioredis prints every failed reconnection when nothing listens for 'error';
  // the stores already log when Redis becomes unavailable and when it comes back.
  rateLimitRedis.on('error', () => {});

  // D. RATE LIMITER: Protect the API from malicious request floods (DDoS).
  const limiter = rateLimit({
    windowMs: settings.rateLimits.global.windowMs, // Window and cap live in src/config.ts
    max: settings.rateLimits.global.max,
    store: new RedisRateLimitStore(rateLimitRedis, 'rl:global:'), // Shared by every replica
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

   /**
   * APPSEC REMEDIATION - BRUTE FORCE THROTTLING LAYER (CWE-307)
   * 
   * Strict rate limiting instance explicitly dedicated to the authentication gateway.
   * Isolates credential probing loops and blocks distributed dictionary credential stuffing.
   */
  const authBruteForceLimiter = rateLimit({
    windowMs: settings.rateLimits.login.windowMs, // Window and cap live in src/config.ts
    max: settings.rateLimits.login.max,
    store: new RedisRateLimitStore(rateLimitRedis, 'rl:login:'), // Shared by every replica
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: {
        code: 'AUTH_FLOOD_DETECTED',
        message: 'Too many authentication attempts from this endpoint link. Access locked for 5 minutes.'
      }
    }
  });

  /**
   * APPSEC REMEDIATION - RESOURCE EXHAUSTION SAFEGUARD (CWE-770)
   * 
   * Restricts prompt execution frequency against local Llama 3 inference infrastructure.
   * Mitigates orchestration compute exhaustion and limits overall system token budget runout.
   */
  const aiInferenceThrottler = rateLimit({
    windowMs: settings.rateLimits.aiChat.windowMs, // Window and cap live in src/config.ts
    max: settings.rateLimits.aiChat.max,
    store: new RedisRateLimitStore(rateLimitRedis, 'rl:ai-chat:'), // Shared by every replica
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: {
        code: 'LLM_COMPUTE_LIMIT_EXCEEDED',
        message: 'Prompt generation burst threshold triggered. Please wait a moment before sending new tokens.'
      }
    }
  });

  // Enable native parsing of JSON request bodies.
  app.use(express.json());

  // =========================================================================
  // 🏭 SERVICE INITIALIZATION AND WIRING (Inversion of Control - IoC)
  // =========================================================================
  // Step A: Instantiate infrastructure and storage relational layers first.
  const userRepository = new UserRepository();

  // 🛡️ REMEDIATION - ANTI-RACE CONDITION LIFECYCLE LOCK
  // Explicitly trigger and AWAIT the table schema validation sequence here.
  // This guarantees PostgreSQL creates DDL catalog indices synchronously BEFORE any server processes listen to routes.
  await userRepository.initialize();

  // Step B: Boot the core domain rule service engine.
  // This layer orchestrates user mutations, CSPRNG calculations, and Bcrypt key-stretching.
  const userService = customUserService || new UserService(userRepository);

  // Step C: Instantiate the broker factory by passing the live service context into the consumer loop.
  // This structural reordering guarantees the background worker thread captures an active pointer to the database casing.
  const eventBrokerService = new EventBrokerService(userService);

  // Step D: Inject structural dependencies into the Controller layer network gateway boundary.
  const userController = new UserController(userService, eventBrokerService);

  // =========================================================================
  // ⏱️ CONSTANT-TIME LOGIN GUARD (CWE-208)
  // =========================================================================
  // A bcrypt hash of a random throwaway value, computed once with the same cost as real
  // password hashes. When the e-mail is unknown, the login compares against it, so the
  // response takes as long as a wrong password and does not reveal which accounts exist.
  const dummyPasswordHash = await bcrypt.hash(crypto.randomUUID(), settings.bcryptSaltRounds);


  // =========================================================================
  // 🔐 DYNAMIC AUTHENTICATION ENDPOINT: POST /auth/login
  // =========================================================================
  // APPSEC REMEDIATION - COMPLIANCE WITH CWE-256 / CWE-798 / OWASP TOP 10
  // Swapped hard-coded static validation for a secure adaptive Bcrypt verification 
  // loop checking real persistent user account records inside the PostgreSQL cluster.
  app.post('/auth/login', authBruteForceLimiter, validateMiddleware(loginSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      // validateMiddleware(loginSchema) has already answered 400 for a missing, blank or non-text
      // field, so this parse only returns the values, with the e-mail already trimmed.
      const { username, password } = loginSchema.shape.body.parse(req.body);

      console.log(`🔑 [Auth] Intercepting authentication token request for address: ${username}`);

      // Locate the account entity using the unique email record pointer mapping
      const userRecord = await userService.getUserByEmail(username);

      // CRYPTOGRAPHIC VERIFICATION: bcrypt always runs, against the dummy hash when the account
      // does not exist, so unknown e-mails and wrong passwords take the same time (CWE-208).
      const isPasswordValid = await bcrypt.compare(password, userRecord?.password ?? dummyPasswordHash);

      // SECURITY POLICY: Unknown e-mails and wrong passwords get the same generic 401 response,
      // so the response body does not reveal which accounts exist either (CWE-204).
      if (!userRecord?.password || !isPasswordValid) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'Credenciais inválidas. Verifique o usuário e a senha inseridos.'
          }
        });
        return;
      }

      // Assemble the session payload context by embedding user parameters
      const sessionPayload = { 
        id: userRecord.id, 
        user: userRecord.name, 
        email: userRecord.email,
        role: 'USER' // Enforce application role hierarchy assignment mapping
      };

      // Sign the final cryptographic token
      const token = jwt.sign(
        sessionPayload, 
        JWT_SECRET, 
        { expiresIn: settings.jwtExpiresIn } // Token lifetime lives in src/config.ts
      );

      console.log(`✅ [Auth] Handshake verified successfully. JWT token issued for user ID: ${userRecord.id}`);
      res.status(200).json({ token });

    } catch (error) {
      console.error('❌ AppSec exception intercepted inside login controller lifecycle:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Operational failure while processing authentication parameters.'
        }
      });
    }
  });

  // ==========================================
  // 🗺️ MAESTRO REST ENDPOINTS
  // ==========================================
  app.get('/users', authMiddleware, validateMiddleware(listUsersSchema), (req: Request, res: Response) => userController.getUsers(req, res));
  app.get('/users/:id', authMiddleware, (req: Request, res: Response) => userController.getUserById(req, res));
  app.post('/api/v1/users', validateMiddleware(createUserSchema), (req: Request, res: Response) => userController.createUser(req, res));

  // ==========================================
  // 🤖 AI ORCHESTRATION
  // ==========================================
  const aiService = new AIService();
  const aiController = new AIController(aiService);
  app.post('/ai/chat', authMiddleware, aiInferenceThrottler, (req, res) => aiController.chat(req, res));

  // ==========================================
  // 📡 🔥 REAL-TIME ENDPOINT: SERVER-SENT EVENTS (SSE)
  // ==========================================
  // 🔥 Route directly through the broker's registerSSEClient method.
  // Turn a standard HTTP connection into a reactive stream connected to the queue.
  app.get('/events', (req: Request, res: Response) => {
    eventBrokerService.registerSSEClient(req, res);
  });

  // =========================================================================
  // 🌌 GRAPHQL CONFIGURATION AND INITIALIZATION
  // =========================================================================
  const typeDefs = fs.readFileSync(path.resolve('src', 'graphql', 'schema.graphql'), 'utf-8');
  
  // Re-use our dynamic resolvers factory from the previous step
  const dynamicGraphQLResolvers = createUserResolvers(userService);
  const apolloServer = new ApolloServer({ typeDefs, resolvers: dynamicGraphQLResolvers });

  if (env.NODE_ENV !== 'test') {
    await apolloServer.start();
    
    // APPSEC REMEDIATION - GRAPHQL AUTHENTICATION FIREWALL (CWE-284 / OWASP TOP 10)
    // We bind a strict context validation loop to the Apollo routing middleware. 
    // This intercepts inbound graph operations and parses the cryptographic JWT signature 
    // from the 'Authorization' header block before allowing any query or mutation resolution.
    app.use('/graphql', expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new Error('UNAUTHORIZED: Missing or malformed authentication bearer signature.');
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
          throw new Error('UNAUTHORIZED: Authentication token missing inside packet string.');
        }

        try {
          // Decrypt and verify the payload using the secure memory-mapped vault key
          const decodedIdentity = jwt.verify(token, JWT_SECRET);
          return { user: decodedIdentity }; // Inject verified session identity into GraphQL context metadata
        } catch (jwtError) {
          throw new Error('UNAUTHORIZED: Cryptographic signature verification failed or token expired.');
        }
      }
    }));
  } 
  // ==========================================
  // 🚀 UNIVERSAL HTTP SERVER STARTUP
  // ==========================================
  const PORT = env.PORT;
  if (env.NODE_ENV === 'test') {
    console.log("⚠️ Test mode enabled: The HTTP server will not start to avoid port conflicts.");
  } else {
    // Listen on 0.0.0.0 to accept Kubernetes traffic.
    server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 REST API, GraphQL & SSE notifications running securely at http://localhost:${PORT}`);
    console.log(`🌌 GraphQL Sandbox active at http://localhost:${PORT}/graphql`);
    console.log(`📡 Real-time SSE notifications channel active at http://localhost:${PORT}/events`);
  });
  }
  return server;
}