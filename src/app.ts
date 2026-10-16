import bcrypt from 'bcrypt'; // Slow-stretched password hashing and verification

// 1. INFRASTRUCTURE AND EXPRESS IMPORTS
import express, { type Request, type Response } from 'express';
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
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Redis } from 'ioredis'; // Client for the shared rate-limit counters

// 3. MIDDLEWARE, ZOD SCHEMA AND CONFIG IMPORTS
import { authMiddleware } from './middlewares/authMiddleware.js';
import { validateMiddleware } from './middlewares/validateMiddleware.js';
import { RedisRateLimitStore } from './middlewares/redisRateLimitStore.js';
import { errorHandler } from './middlewares/errorHandler.js'; // Central JSON error responses (CWE-209)
import { createUserSchema, listUsersSchema } from './schemas/userSchema.js';
import { loginSchema } from './schemas/authSchema.js';
import { chatSchema } from './schemas/aiSchema.js';
import { env, settings, redisConnection } from './config.js'; // Validated environment, fixed limits and the Redis connection (also loads .env)
// Signs the login tokens. src/config.ts stops the boot if JWT_SECRET is missing or too short (CWE-798).
import { signAccessToken } from './auth/accessToken.js';
// The HttpOnly session cookie (CWE-922) and the CSRF Origin check that protects it (CWE-352).
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './auth/sessionCookie.js';
import { originCheck } from './middlewares/originCheck.js';

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
  // The Content Security Policy now applies in every environment: it was turned off outside
  // production only to let the Apollo Sandbox page run, and GraphQL was retired (ADR 0001).
  app.use(helmet());

  // B. CORS: Restrict request origins to traffic from the Next.js frontend (settings.allowedOrigins).
  // The cors middleware also answers every preflight (OPTIONS) request itself, echoing an origin only
  // when it is on the list. The old hand-written OPTIONS handler, which echoed any Origin (or '*'),
  // was removed (CWE-942).
  app.use(cors({ 
    origin: [...settings.allowedOrigins],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Let the browser send and receive the HttpOnly session cookie
  }));

  // C. CSRF ORIGIN CHECK (CWE-352): state-changing requests from a browser page must come from an
  // allowed origin, a second layer on top of the SameSite=Strict session cookie (originCheck.ts).
  app.use(originCheck);
  
  // D. SHARED RATE-LIMIT COUNTERS (CWE-770): Kubernetes runs two API replicas, so the three
  // limiters below keep their counters in Redis (src/middlewares/redisRateLimitStore.ts).
  // Without an offline queue, commands fail at once while Redis is down, and the stores
  // switch to per-process memory counters instead of holding requests until Redis returns.
  const rateLimitRedis = new Redis({
    ...redisConnection, // Host, port and REDIS_PASSWORD from src/config.ts (CWE-306)
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // ioredis prints every failed reconnection when nothing listens for 'error';
  // the stores already log when Redis becomes unavailable and when it comes back.
  rateLimitRedis.on('error', () => {});

  // E. RATE LIMITER: Protect the API from malicious request floods (DDoS).
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
   * APPSEC REMEDIATION - RESOURCE EXHAUSTION SAFEGUARD (CWE-770 / OWASP LLM10:2025)
   *
   * Restricts prompt execution frequency against the model server (local Llama 3 by default).
   * Mitigates orchestration compute exhaustion and limits overall system token budget runout.
   */
  const aiInferenceThrottler = rateLimit({
    windowMs: settings.rateLimits.aiChat.windowMs, // Window and cap live in src/config.ts
    max: settings.rateLimits.aiChat.max,
    // PER-ACCOUNT LIMIT: /ai/chat runs after authMiddleware, which stores the verified JWT payload
    // in req.user, so the counter follows the account instead of the IP address. Users behind one
    // shared IP (an office or a mobile carrier) no longer block each other, and one account cannot
    // multiply its budget by switching networks. The IP is only a fallback for a token without an
    // id claim; ipKeyGenerator groups IPv6 addresses by subnet, as express-rate-limit recommends.
    keyGenerator: (req: Request) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
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
    // No try/catch here: Express 5 sends a rejected promise (for example, the database lookup
    // failing) to the central errorHandler, which logs it and answers a generic 500.
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
      // The account's access level from the users table (USER unless promoted to ADMIN in the
      // database). The access rules in src/auth/userPolicy.ts read it from the verified token.
      role: userRecord.role ?? 'USER'
    };

    // Sign the final cryptographic token: HS256 with the issuer, audience and lifetime from
    // settings.jwt, the same rules authMiddleware checks (src/auth/accessToken.ts).
    const token = signAccessToken(sessionPayload);

    console.log(`✅ [Auth] Handshake verified successfully. JWT token issued for user ID: ${userRecord.id}`);

    // SESSION COOKIE (CWE-922): the token goes into an HttpOnly, SameSite=Strict cookie that page
    // scripts cannot read, and it is no longer returned in the body, so the frontend never holds it.
    // API clients that need a Bearer token can take it from the Set-Cookie header.
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.status(200).json({ user: sessionPayload });
  });

  // =========================================================================
  // 🚪 LOGOUT: POST /auth/logout
  // =========================================================================
  // Clears the session cookie with the same attributes it was set with, otherwise the browser keeps
  // it. The JWT inside stays valid until it expires (at most settings.jwt.expiresIn), but the
  // browser no longer sends it. Answering without a session is fine: logging out twice is harmless.
  app.post('/auth/logout', (req: Request, res: Response) => {
    const { maxAge: _lifetime, ...clearOptions } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    res.sendStatus(204);
  });

  // ==========================================
  // 🗺️ MAESTRO REST ENDPOINTS
  // ==========================================
  app.get('/users', authMiddleware, validateMiddleware(listUsersSchema), (req: Request, res: Response) => userController.getUsers(req, res));
  // /users/me is registered before /users/:id, otherwise Express would read "me" as an id.
  app.get('/users/me', authMiddleware, (req: Request, res: Response) => userController.getCurrentUser(req, res));
  app.get('/users/:id', authMiddleware, (req: Request, res: Response) => userController.getUserById(req, res));
  app.post('/api/v1/users', validateMiddleware(createUserSchema), (req: Request, res: Response) => userController.createUser(req, res));

  // ==========================================
  // 🤖 AI ORCHESTRATION
  // ==========================================
  const aiService = new AIService();
  const aiController = new AIController(aiService);
  // Order: authMiddleware sets req.user, the throttler counts per account, and chatSchema rejects
  // an oversized prompt before it reaches the model (invalid prompts still count toward the limit).
  app.post('/ai/chat', authMiddleware, aiInferenceThrottler, validateMiddleware(chatSchema), (req: Request, res: Response) => aiController.chat(req, res));

  // ==========================================
  // 📡 🔥 REAL-TIME ENDPOINT: SERVER-SENT EVENTS (SSE)
  // ==========================================
  // 🔥 Route directly through the broker's registerSSEClient method.
  // Turn a standard HTTP connection into a reactive stream connected to the queue.
  // AUTHENTICATED STREAM (issue #35): authMiddleware runs first. The browser's EventSource cannot set
  // an Authorization header, so it sends the session cookie (new EventSource(url, { withCredentials: true })).
  app.get('/events', authMiddleware, (req: Request, res: Response) => {
    eventBrokerService.registerSSEClient(req, res);
  });

  // GraphQL was retired (docs/adr/0001-retire-the-graphql-endpoint.md): REST, described by
  // openapi.yaml, is the single API contract. Every route above must appear in openapi.yaml,
  // which the inventory test in tests/userRoutes.spec.ts checks.

  // ==========================================
  // 🚫 JSON 404 FOR UNKNOWN ROUTES
  // ==========================================
  // Registered after every route. Without it, Express answers unknown
  // paths with its default HTML page; API clients get the same JSON error envelope instead.
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'A rota solicitada não existe nesta API.'
      }
    });
  });

  // ==========================================
  // 🧯 CENTRAL ERROR HANDLER (CWE-209)
  // ==========================================
  // Registered last, after the 404 handler. When an error is raised, Express skips the
  // normal middleware and jumps to the first handler with four parameters. Every route
  // failure, rejected promise and unreadable JSON body ends here and gets the same JSON
  // envelope, without internal error text (see src/middlewares/errorHandler.ts).
  app.use(errorHandler);

  // ==========================================
  // 🚀 UNIVERSAL HTTP SERVER STARTUP
  // ==========================================
  const PORT = env.PORT;
  if (env.NODE_ENV === 'test') {
    console.log("⚠️ Test mode enabled: The HTTP server will not start to avoid port conflicts.");
  } else {
    // Listen on 0.0.0.0 to accept Kubernetes traffic.
    server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 REST API & SSE notifications running securely at http://localhost:${PORT}`);
    console.log(`📡 Real-time SSE notifications channel active at http://localhost:${PORT}/events`);
  });
  }
  return server;
}