// 🔥 SECURITY REQUIREMENT: Load dotenv on the first line to read .env into API memory.
import 'dotenv/config';
import bcrypt from 'bcrypt'; // Slow-stretched password hashing and verification

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

// ARCHITECTURAL REMEDIATION - PURGE MODULE-LEVEL SIDE EFFECTS
// Swapped out the static 'userResolvers' instantiation link for our clean dynamic factory function.
import { createUserResolvers } from './graphql/userResolvers.js';

// =========================================================================
// 🔐 CRYPTOGRAPHIC VAULT & ENVIRONMENT VALIDATION (CWE-798)
// =========================================================================
// Inspect the active environment memory mapping for the critical sign token.
// If the DevOps orchestration layer fails to inject the secret key, we enforce
// an immediate runtime crash condition to prevent operating in an insecure state.
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL APPSEC FAILURE: SECURITY ENVIRONMENT MISCONFIGURATION');
  console.error('=> The system requires an explicit cryptographic [JWT_SECRET] variable payload.');
  console.error('=> Application engine startup aborted to isolate crypto token exposure vectors.');
  process.exit(1); // Force immediate system termination with structural error code
}

// Extract the thoroughly vetted cryptographic secret token directly from system memory mapping
const JWT_SECRET = process.env.JWT_SECRET;

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

   /**
   * APPSEC REMEDIATION - BRUTE FORCE THROTTLING LAYER (CWE-307)
   * 
   * Strict rate limiting instance explicitly dedicated to the authentication gateway.
   * Isolates credential probing loops and blocks distributed dictionary credential stuffing.
   */
  const authBruteForceLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5-minute strict monitoring window
    max: 5, // Limit each source IP address to exactly 5 login attempts per window loop
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
    windowMs: 1 * 60 * 1000, // 1-minute tracking micro-window
    max: 10, // Max 10 complex prompt dispatches per minute per active client IP context
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
  // 🔐 DYNAMIC AUTHENTICATION ENDPOINT: POST /auth/login
  // =========================================================================
  // APPSEC REMEDIATION - COMPLIANCE WITH CWE-256 / CWE-798 / OWASP TOP 10
  // Swapped hard-coded static validation for a secure adaptive Bcrypt verification 
  // loop checking real persistent user account records inside the PostgreSQL cluster.
  app.post('/auth/login', authBruteForceLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;

      // 🛡️ EDGE VALIDATION: Reject malformed payload elements prior to database I/O processing
      if (!username || !password || username.trim() === '' || password.trim() === '') {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'O e-mail (username) e a chave de acesso (password) são obrigatórios.'
          }
        });
        return;
      }

      console.log(`🔑 [Auth] Intercepting authentication token request for address: ${username}`);

      // Locate the account entity using the unique email record pointer mapping
      const userRecord = await userService.getUserByEmail(username.trim());

      // SECURITY POLICY: If the account does not exist, return a generic 401 error payload.
      // This strictly prevents User Enumeration vulnerabilities (CWE-204) where attackers 
      // probe inputs to discover which e-mails exist in our application ecosystem.
      if (!userRecord || !userRecord.password) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'Credenciais inválidas. Verifique o usuário e a senha inseridos.'
          }
        });
        return;
      }

      // CRYPTOGRAPHIC VERIFICATION: Slow-stretched evaluation comparing plaintext string with password hash
      const isPasswordValid = await bcrypt.compare(password, userRecord.password);

      if (!isPasswordValid) {
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
        { expiresIn: '1h' } // Enforce robust 1-hour expiration time window
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
  app.get('/users', authMiddleware, (req: Request, res: Response) => userController.getUsers(req, res));
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

  if (process.env.NODE_ENV !== 'test') {
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
  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV === 'test') {
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