// 1. IMPORTS: Bring in Express request/response types and the service layer.
// Use 'type' for Request/Response because they are TypeScript-only structural types.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';
import { createUserSchema, listUsersSchema, userIdParamsSchema } from '../schemas/userSchema.js';
import { AppError } from '../errors/AppError.js'; // Expected failures answered by the central errorHandler
import { type AccessTokenClaims } from '../auth/accessToken.js';
import { canListUsers, canReadUser } from '../auth/userPolicy.js'; // Who may read which user records (issue #36)
import { toUserResponse } from '../dtos/userResponse.js'; // The only public shape of a user record (issue #48)
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)
// Versioned cache of GET /api/v1/users pages (issue #52). src/app.ts creates it with the shared Redis
// connection settings (REDIS_PASSWORD included, CWE-306) and injects it here.
import { UsersCache } from '../cache/usersCache.js';

// The verified token claims of the caller. authMiddleware runs before every route that calls this, so
// req.user is always set; a missing value would mean a route was wired without it, so fail closed with 401.
function requesterOf(req: Request): AccessTokenClaims {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token not provided');
  }
  return req.user;
}

// 2. CONTROLLER CLASS: This layer is the API's gateway.
// It receives requests, calls the service, and returns an HTTP response.
export class UserController {
  // DEPENDENCY INJECTION: The controller does not create the service itself.
  // INVERSION OF CONTROL (IoC): The constructor receives live instances from the main factory.
  // The caller provides ready-to-use UserService, EventBrokerService and UsersCache instances.
  constructor(
    private userService: UserService,
    private eventBrokerService: EventBrokerService,
    private usersCache: UsersCache
  ) {}

  /**
   * 📡 ENDPOINT 1 (GET /api/v1/users): List users using the Redis Cache-Aside pattern.
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
      throw new AppError(403, 'FORBIDDEN', 'Only administrators can list the users.');
    }

    // Read pagination from the query string. validateMiddleware(listUsersSchema) has already
    // answered 400 for invalid values, so this parse only turns the text into numbers
    // and fills in the defaults from src/config.ts.
    const { limit: limitNumber, offset: offsetNumber } = listUsersSchema.shape.query.parse(req.query);

    // Step A: Read the cache version once, BEFORE the database query (src/cache/usersCache.ts). The
    // page is later stored under this same version, so a page computed while a new account is being
    // saved lands under the old version and is never served as current. null = Redis unavailable.
    const cacheVersion = await this.usersCache.currentVersion();

    // Step B: On a cache hit, respond immediately, avoiding PostgreSQL I/O. The cached page was
    // mapped to the public view before it was stored (Step D).
    const cachedUsers =
      cacheVersion === null ? null : await this.usersCache.getPage(cacheVersion, limitNumber, offsetNumber);
    if (cachedUsers) {
      logger.debug({ component: 'cache', limit: limitNumber, offset: offsetNumber }, 'Users page served from Redis');
      res.status(200).json(cachedUsers);
      return;
    }

    logger.debug(
      { component: 'cache', limit: limitNumber, offset: offsetNumber },
      'Users page not cached; reading PostgreSQL'
    );

    // Step C: On a cache miss, get the records from the relational database through the service.
    const users = await this.userService.getAllUsers({
      limit: limitNumber,
      offset: offsetNumber
    });

    // PUBLIC VIEW (issue #48): map every record to the response DTO before it is cached or sent,
    // so neither the client nor the Redis cache ever holds a hash, a role or any column a future
    // query might select. Cache hits (Step B) therefore replay data that was already filtered.
    const publicUsers = users.map(toUserResponse);

    // Step D: Store the page under the version read in Step A, with the TTL from src/config.ts
    // (settings.usersCacheTtlSeconds) to limit how long stale data can remain cached.
    if (cacheVersion !== null) {
      await this.usersCache.setPage(cacheVersion, limitNumber, offsetNumber, publicUsers);
    }

    // Step E: Return the consolidated data to the client.
    res.status(200).json(publicUsers);
  };

  /**
   * 📡 ENDPOINT 2 (GET /api/v1/users/:id): Look up a record by its indexed identifier.
   * Search PostgreSQL persistence for a single record.
   */
  getUserById = async (req: Request, res: Response): Promise<void> => {
    // No try/catch: a database failure reaches the central errorHandler (see getUsers above).
    // validateMiddleware(userIdParamsSchema) has already answered 400 VALIDATION_FAILURE for a blank or
    // oversized id (issue #49), so this parse only returns it, trimmed and typed as a string.
    const { id } = userIdParamsSchema.shape.params.parse(req.params);

    // ACCESS RULE (BOLA, OWASP API1:2023): a record is visible to its owner and to admins. The check
    // runs before the lookup, so another account's id gets 403 whether that account exists or not.
    if (!canReadUser(requesterOf(req), id)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view your own account.');
    }

    // Forward the lookup to the service layer.
    const user = await this.userService.getUserById(id);

    // Return 404 if the database has no matching record.
    if (!user) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested user was not found in the relational database.'
        }
      });
      return;
    }

    // Return only the public fields (issue #48): the record from the service may carry more.
    res.status(200).json(toUserResponse(user));
  };

  /**
   * 📡 ENDPOINT 2B (GET /api/v1/users/me): Read the caller's own record.
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
          message: 'The requested user was not found in the relational database.'
        }
      });
      return;
    }

    // Same public view as GET /api/v1/users/{id} (issue #48).
    res.status(200).json(toUserResponse(user));
  };

  /**
   * 📡 ENDPOINT 3 (POST /api/v1/users): Submit a request to the queue asynchronously.
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
        'The registration service is temporarily unavailable. Please try again shortly.'
      );
    }

    // NO CACHE INVALIDATION HERE (issue #52): this ran redis.keys('users:*'), which blocks Redis
    // while it walks the whole keyspace, and it ran too early: the account does not exist until the
    // queue consumer saves it, so the next GET /api/v1/users cached a page without it for 60 seconds.
    // The consumer (EventBrokerService) now invalidates the cache right after the row is written.

    res.status(202).json({
      message: 'Registration request received! Processing it asynchronously through the event queue...'
    });
  };
}
