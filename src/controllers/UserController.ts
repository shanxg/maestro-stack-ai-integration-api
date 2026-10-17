// 1. IMPORTS: Bring in Express request/response types and the service layer.
// Use 'type' for Request/Response because they are TypeScript-only structural types.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';
import { createUserSchema, listUsersSchema } from '../schemas/userSchema.js';
import { settings, redisConnection } from '../config.js';
import { AppError } from '../errors/AppError.js'; // Expected failures answered by the central errorHandler
import { type AccessTokenClaims } from '../auth/accessToken.js';
import { canListUsers, canReadUser } from '../auth/userPolicy.js'; // Who may read which user records (issue #36)
import { toUserResponse } from '../dtos/userResponse.js'; // The only public shape of a user record (issue #48)

// Redis client library
import { Redis } from 'ioredis'; 
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)
// Host, port and password come from src/config.ts (redisConnection): Redis requires
// authentication, so the cache client always sends REDIS_PASSWORD (CWE-306).
const redis = new Redis({ ...redisConnection });

// The verified token claims of the caller. authMiddleware runs before every route that calls this, so
// req.user is always set; a missing value would mean a route was wired without it, so fail closed with 401.
function requesterOf(req: Request): AccessTokenClaims {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token não fornecido');
  }
  return req.user;
}

// 2. CONTROLLER CLASS: This layer is the API's gateway.
// It receives requests, calls the service, and returns an HTTP response.
export class UserController {
  // DEPENDENCY INJECTION: The controller does not create the service itself.
  // INVERSION OF CONTROL (IoC): The constructor receives live instances from the main factory.
  // The caller provides ready-to-use UserService and EventBrokerService instances.
  constructor(
    private userService: UserService,
    private eventBrokerService: EventBrokerService
  ) {}

  /**
  * 📡 ENDPOINT 1 (GET /users): List users using the Redis Cache-Aside pattern.
  * Safely paginate queries against PostgreSQL persistence.
   */
  getUsers = async (req: Request, res: Response): Promise<void> => {
    // NO TRY/CATCH (CWE-209): a Redis or PostgreSQL failure rejects this promise, and Express 5
    // hands it to the central errorHandler (src/middlewares/errorHandler.ts). The handler logs
    // the full error and answers a generic 500, so internal text such as a database address
    // never reaches the client. A database outage arrives as a 503 AppError from the repository
    // (issue #93), and since it is thrown before Step D, a failed query is never cached.
    // The other methods below follow the same rule.

    // ACCESS RULE (BFLA, OWASP API5:2023): listing every account is for admins only. The check runs
    // before the cache read, so a cached page is never served to an account that may not see it.
    if (!canListUsers(requesterOf(req))) {
      throw new AppError(403, 'FORBIDDEN', 'Apenas administradores podem listar os usuários.');
    }

    // Read pagination from the query string. validateMiddleware(listUsersSchema) has already
    // answered 400 for invalid values, so this parse only turns the text into numbers
    // and fills in the defaults from src/config.ts.
    const { limit: limitNumber, offset: offsetNumber } = listUsersSchema.shape.query.parse(req.query);

    // Give each page combination its own Redis cache key.
    const cacheKey = `users:limit=${limitNumber}:offset=${offsetNumber}`;

    // Step A: Check Redis for a cached result using the page-specific key.
    const cachedUsers = await redis.get(cacheKey);

    // Step B: On a cache hit, parse the JSON and respond immediately,
    // avoiding additional processing and PostgreSQL I/O.
    if (cachedUsers) {
      logger.debug({ component: 'cache', cacheKey }, 'Users page served from Redis');
      res.status(200).json(JSON.parse(cachedUsers));
      return;
    }

    logger.debug({ component: 'cache', cacheKey }, 'Users page not cached; reading PostgreSQL');

    // Step C: On a cache miss, get the records from the relational database through the service.
    const users = await this.userService.getAllUsers({
      limit: limitNumber,
      offset: offsetNumber
    });

    // PUBLIC VIEW (issue #48): map every record to the response DTO before it is cached or sent,
    // so neither the client nor the Redis cache ever holds a hash, a role or any column a future
    // query might select. Cache hits (Step B) therefore replay data that was already filtered.
    const publicUsers = users.map(toUserResponse);

    // Step D: Store the result as JSON in Redis with the TTL from src/config.ts
    // to limit how long stale data can remain cached.
    await redis.set(cacheKey, JSON.stringify(publicUsers), 'EX', settings.usersCacheTtlSeconds);

    // Step E: Return the consolidated data to the client.
    res.status(200).json(publicUsers);
  };

  /**
  * 📡 ENDPOINT 2 (GET /users/:id): Look up a record by its indexed identifier.
  * Search PostgreSQL persistence for a single record.
   */
  getUserById = async (req: Request, res: Response): Promise<void> => {
    // No try/catch: a database failure reaches the central errorHandler (see getUsers above).
    const { id } = req.params;

    // Reject an ID that is blank or malformed in the URL.
    // OWASP pattern: return an enveloped error with a client-readable code.
    if (!id || typeof id !== 'string' || id.trim() === '') {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'O parâmetro de identificação do Usuário (ID) é mandatório e precisa ser válido.'
        }
      });
      return;
    }

    // ACCESS RULE (BOLA, OWASP API1:2023): a record is visible to its owner and to admins. The check
    // runs before the lookup, so another account's id gets 403 whether that account exists or not.
    if (!canReadUser(requesterOf(req), id.trim())) {
      throw new AppError(403, 'FORBIDDEN', 'Você só pode consultar o seu próprio cadastro.');
    }

    // Forward the lookup to the service layer.
    const user = await this.userService.getUserById(id.trim());

    // Return 404 if the database has no matching record.
    if (!user) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'O usuário solicitado não foi localizado na base de dados relacional.'
        }
      });
      return;
    }

    // Return only the public fields (issue #48): the record from the service may carry more.
    res.status(200).json(toUserResponse(user));
  };

  /**
  * 📡 ENDPOINT 2B (GET /users/me): Read the caller's own record.
  * The id comes from the verified token, never from the URL, so there is nothing to tamper with.
   */
  getCurrentUser = async (req: Request, res: Response): Promise<void> => {
    // No try/catch: a database failure reaches the central errorHandler (see getUsers above).
    const user = await this.userService.getUserById(requesterOf(req).id);

    // The token can outlive its account (for example, a deleted user): answer 404 like any missing record.
    if (!user) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'O usuário solicitado não foi localizado na base de dados relacional.'
        }
      });
      return;
    }

    // Same public view as GET /users/{id} (issue #48).
    res.status(200).json(toUserResponse(user));
  };

   /**
  * 📡 ENDPOINT 3 (POST /users): Submit a request to the queue asynchronously.
  * Accept the payload, calculate the cryptographic hash stream, and send it to RabbitMQ.
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    // No try/catch: hashing, queue and Redis failures reach the central errorHandler (see getUsers above).
    // TYPED BODY (issue #47): Express types req.body as 'any', so reading it directly let any value
    // through unchecked by the compiler. validateMiddleware(createUserSchema) has already answered 400
    // for a missing or invalid field, so this parse only returns the three fields as typed strings
    // (the same pattern as the login and the AI chat routes); the old manual 400 check is no longer needed.
    const { name, email, password } = createUserSchema.shape.body.parse(req.body);

    // =========================================================================
    // 🔐 IMMEDIATE CRYPTOGRAPHIC SHIELDING (CWE-256 / OWASP TOP 10 API Security)
    // =========================================================================
    // We compute the cryptographic hash stream right at the edge application interface.
    // This guarantees that cleartext password strings never transit or leak inside internal message brokers.
    // UserService.hashPassword is the single place that hashes passwords (work factor in src/config.ts).
    const cryptographicPasswordHash = await this.userService.hashPassword(password);

    // Construct a safe data container containing the stretched and hashed variable payload
    const securedUserPayload = {
      name,
      email,
      password: cryptographicPasswordHash
    };

    // =========================================================================
    // 📤 ASYNCHRONOUS EVENT PIPELINE (RABBITMQ)
    // =========================================================================
    // Publish the protected data block containing the hashed payload into the queue structure
    const isQueued = await this.eventBrokerService.publishEvent('user_created', securedUserPayload);

    // publishEvent returns false when the RabbitMQ channel is offline or the send fails, so the
    // registration cannot be queued. That is an expected outage, not a bug: answer 503 so the
    // client knows it can try again later. The AppError message is written for the client,
    // and the central errorHandler sends it as it is (the broker's own error stays in the log).
    if (!isQueued) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'O serviço de cadastro está temporariamente indisponível. Tente novamente em instantes.'
      );
    }

    // =========================================================================
    // 🧹 AUTOMATIC CACHE INVALIDATION (REGEX PURGE)
    // =========================================================================
    const targetedKeys = await redis.keys('users:*');
    if (targetedKeys.length > 0) {
      await redis.del(...targetedKeys);
      logger.info({ component: 'cache', purgedKeys: targetedKeys.length }, 'Users cache invalidated');
    }

    res.status(202).json({
      message: 'Solicitação de cadastro recebida com sucesso! Processando em lote assíncrono na fila de eventos...'
    });
  };
}