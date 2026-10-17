// 1. INFRASTRUCTURE AND EXPRESS IMPORTS
import express, { type Request, type Response } from 'express';
import http from 'node:http';   // Node module for managing network servers

// User domain layers
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';
import { UserController } from './controllers/UserController.js';
import { UsersCache } from './cache/usersCache.js'; // Versioned GET /users page cache (issue #52)

// Authentication layers: the login rules and their HTTP controller (issue #46)
import { AuthService } from './services/AuthService.js';
import { AuthController } from './controllers/AuthController.js';

// 🔥 UNIFIED MESSAGING AND REAL-TIME SUPPORT
// The unified service that manages the RabbitMQ queue and the Server-Sent Events connections.
import { EventBrokerService } from './services/EventBrokerService.js';

// Local AI domain layers
import { AIService } from './services/AIService.js';
import { AIController } from './controllers/AIController.js';

// Route modules (issue #46): each one declares its paths and middleware order.
import { createAuthRouter } from './routes/authRoutes.js';
import { createUserRouter } from './routes/userRoutes.js';
import { createAiRouter } from './routes/aiRoutes.js';
import { createEventRouter } from './routes/eventRoutes.js';

// 2. GLOBAL SECURITY PACKAGE IMPORTS (OWASP TOP 10)
import helmet from 'helmet';
import cors from 'cors';
import { Redis } from 'ioredis'; // Clients for the shared rate-limit counters and the users cache

// 3. MIDDLEWARE AND CONFIG IMPORTS
import { createRateLimiters } from './middlewares/rateLimiters.js'; // Global, login and AI chat limits
import { errorHandler } from './middlewares/errorHandler.js'; // Central JSON error responses (CWE-209)
import { env, redisConnection } from './config.js'; // Validated environment and the Redis connection (also loads .env)
// The CSRF Origin check that protects the HttpOnly session cookie (CWE-352).
import { originCheck } from './middlewares/originCheck.js';
import { logger } from './logger.js'; // Structured logger without personal data (issue #53)

/**
 * 🏭 APPLICATION FACTORY (createApp) — THE COMPOSITION ROOT (issue #46):
 * This function only assembles the API: global middleware, the object graph (repository →
 * services → controllers) and the route modules. Before, it also held the login logic, the
 * rate-limiter definitions and every route; those now live in AuthService/AuthController,
 * src/middlewares/rateLimiters.ts and src/routes/.
 *
 * It lets Jest inject a service mock, so tests run without external services. The optional
 * service is typed as UserService (issue #47): a replacement must offer the same methods.
 */
export async function createApp(customUserService?: UserService) {

  const app = express();

  // Create a native HTTP server around the Express application.
  const server = http.createServer(app);

  // ==========================================
  // 🛡️ NETWORK PROTECTION MIDDLEWARE
  // ==========================================

  // A. HELMET: Set strict HTTP headers to mitigate clickjacking, sniffing, and XSS.
  // The Content Security Policy applies in every environment (GraphQL and its Sandbox page were
  // retired, ADR 0001).
  app.use(helmet());

  // B. CORS: Restrict request origins to traffic from the Next.js frontend (ALLOWED_ORIGINS in src/config.ts).
  // The cors middleware also answers every preflight (OPTIONS) request itself, echoing an origin only
  // when it is on the list (CWE-942).
  app.use(cors({
    origin: [...env.ALLOWED_ORIGINS],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Let the browser send and receive the HttpOnly session cookie
  }));

  // C. CSRF ORIGIN CHECK (CWE-352): state-changing requests from a browser page must come from an
  // allowed origin, a second layer on top of the SameSite=Strict session cookie (originCheck.ts).
  app.use(originCheck);

  // D. RATE LIMITS (CWE-770 / CWE-307): the counters live in Redis, shared by every replica. Without
  // an offline queue, commands fail at once while Redis is down, and the stores switch to
  // per-process memory counters instead of holding requests until Redis returns.
  const rateLimitRedis = new Redis({
    ...redisConnection, // Host, port and REDIS_PASSWORD from src/config.ts (CWE-306)
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // ioredis prints every failed reconnection when nothing listens for 'error';
  // the stores already log when Redis becomes unavailable and when it comes back.
  rateLimitRedis.on('error', () => {});
  const rateLimiters = createRateLimiters(rateLimitRedis);

  // The global limit applies to every route; the login and AI limits are added by their routers.
  app.use(rateLimiters.global);

  // Enable native parsing of JSON request bodies.
  app.use(express.json());

  // =========================================================================
  // 🏭 SERVICE INITIALIZATION AND WIRING (Inversion of Control - IoC)
  // =========================================================================
  // Step A: Instantiate the storage layer first.
  const userRepository = new UserRepository();

  // 🛡️ ANTI-RACE CONDITION LIFECYCLE LOCK: AWAIT the table creation here, so PostgreSQL has the
  // schema BEFORE the server listens to any route.
  await userRepository.initialize();

  // Step B: The user domain service (CSPRNG ids, bcrypt hashing, persistence rules).
  const userService = customUserService || new UserService(userRepository);

  // Step C: The GET /users page cache (issue #52). Its own Redis client uses the shared connection
  // settings (REDIS_PASSWORD included, CWE-306) and, like the rate-limit client, fails at once while
  // Redis is down instead of queueing commands, so a request falls back to PostgreSQL immediately.
  const cacheRedis = new Redis({ ...redisConnection, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
  cacheRedis.on('error', () => {}); // Failures are logged by UsersCache when a command fails
  const usersCache = new UsersCache(cacheRedis);

  // Step D: The broker gets the live service for its queue consumer, which also invalidates the
  // cache once a queued account is saved.
  const eventBrokerService = new EventBrokerService(userService, usersCache);

  // Step E: Controllers. AuthService computes its constant-time dummy hash once here (CWE-208).
  const userController = new UserController(userService, eventBrokerService, usersCache);
  const authController = new AuthController(await AuthService.create(userService));
  const aiController = new AIController(new AIService());

  // =========================================================================
  // 🗺️ ROUTES (src/routes/)
  // =========================================================================
  // Each router declares full paths and is mounted at '/'. GraphQL was retired
  // (docs/adr/0001-retire-the-graphql-endpoint.md): REST, described by openapi.yaml, is the single
  // API contract, and the inventory test in tests/userRoutes.spec.ts checks every route is documented.
  app.use(createAuthRouter(authController, rateLimiters.login));
  app.use(createUserRouter(userController));
  app.use(createAiRouter(aiController, rateLimiters.aiChat));
  app.use(createEventRouter(eventBrokerService));

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
    logger.info({ component: 'server' }, 'Test mode: the HTTP server does not listen, to avoid port conflicts');
  } else {
    // Listen on 0.0.0.0 to accept Kubernetes traffic.
    server.listen(PORT, "0.0.0.0", () => {
      logger.info({ component: 'server', port: PORT }, 'REST API and Server-Sent Events stream listening');
    });
  }
  return server;
}
