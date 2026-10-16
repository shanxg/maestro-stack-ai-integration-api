// 1. IMPORTS: Bring in Express request/response types and the service layer.
// Use 'type' for Request/Response because they are TypeScript-only structural types.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';
import { listUsersSchema } from '../schemas/userSchema.js';
import { settings, redisConnection } from '../config.js';
import { AppError } from '../errors/AppError.js'; // Expected failures answered by the central errorHandler

// Redis client library
import { Redis } from 'ioredis'; 
// Host, port and password come from src/config.ts (redisConnection): Redis requires
// authentication, so the cache client always sends REDIS_PASSWORD (CWE-306).
const redis = new Redis({ ...redisConnection });

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
    // never reaches the client. The other methods below follow the same rule.

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
      console.log(`⚡ [Redis] Cache hit for key: ${cacheKey}`);
      res.status(200).json(JSON.parse(cachedUsers));
      return;
    }

    console.log(`⚠️ [Redis] Cache miss. Querying the PostgreSQL layer...`);

    // Step C: On a cache miss, get the records from the relational database through the service.
    const users = await this.userService.getAllUsers({
      limit: limitNumber,
      offset: offsetNumber
    });

    // Step D: Store the result as JSON in Redis with the TTL from src/config.ts
    // to limit how long stale data can remain cached.
    await redis.set(cacheKey, JSON.stringify(users), 'EX', settings.usersCacheTtlSeconds);

    // Step E: Return the consolidated data to the client.
    res.status(200).json(users);
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

    // Return the structured, typed User object.
    res.status(200).json(user);
  };

   /**
  * 📡 ENDPOINT 3 (POST /users): Submit a request to the queue asynchronously.
  * Accept the payload, calculate the cryptographic hash stream, and send it to RabbitMQ.
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    // No try/catch: hashing, queue and Redis failures reach the central errorHandler (see getUsers above).
    // APPSEC REMEDIATION: Safely extract the secret password credential from the validated request body
    const { name, email, password } = req.body;

    // 🛡️ REQUIRED INPUT VALIDATION: Reject the request if any core credential parameter is missing.
    if (!name || !email || !password) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Os campos nome, e-mail e senha são obrigatórios para registrar uma intenção de cadastro.'
        }
      });
      return;
    }

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
      console.log(`🧹 [Redis] Strict invalidation complete. ${targetedKeys.length} stale keys were purged.`);
    }

    res.status(202).json({
      message: 'Solicitação de cadastro recebida com sucesso! Processando em lote assíncrono na fila de eventos...'
    });
  };
}