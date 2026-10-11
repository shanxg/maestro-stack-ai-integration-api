// 1. IMPORTS: Bring in Express request/response types and the service layer.
// Use 'type' for Request/Response because they are TypeScript-only structural types.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';

// Import industrial-grade security library for password hashing
import bcrypt from 'bcrypt';

// Redis client library
import { Redis } from 'ioredis'; 
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',  // Redis server address
  port: 6379,        // Default Redis port
});

// 2. CONTROLLER CLASS: This layer is the API's gateway.
// It receives requests, calls the service, and returns an HTTP response.
export class UserController {
  // APPSEC CONFIGURATION: Define a robust workload cost factor (12 rounds balances CPU overhead and security)
  private readonly SALT_ROUNDS = 12;
  
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
    try {
      // Read pagination parameters from the request URL query string.
      // Default to limit=10 and offset=0 when values are omitted.
      const { limit = '10', offset = '0' } = req.query;

      // Convert URL values to integers.
      // Math.max() prevents gaps caused by malicious negative pagination values.
      const limitNumber = Math.max(1, parseInt(limit as string, 10));
      const offsetNumber = Math.max(0, parseInt(offset as string, 10));

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
      
      // Step D: Store the result as JSON in Redis with a 60-second TTL
      // to limit how long stale data can remain cached.
      await redis.set(cacheKey, JSON.stringify(users), 'EX', 60);
      
      // Step E: Return the consolidated data to the client.
      res.status(200).json(users);

    } catch (error: any) {
      console.error('❌ Critical processing failure in getUsers:', error);
       res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Falha operacional de performance interna no servidor de dados.',
          details: error.message
        }
      });
    }
  };

  /**
  * 📡 ENDPOINT 2 (GET /users/:id): Look up a record by its indexed identifier.
  * Search PostgreSQL persistence for a single record.
   */
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
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

    } catch (error: any) {
      console.error('❌ Critical failure in getUserById:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno ao processar a busca por identificador.',
          details: error.message
        }
      });
    }
  };

   /**
  * 📡 ENDPOINT 3 (POST /users): Submit a request to the queue asynchronously.
  * Accept the payload, calculate the cryptographic hash stream, and send it to RabbitMQ.
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
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
      const secureSalt = await bcrypt.genSalt(this.SALT_ROUNDS);
      const cryptographicPasswordHash = await bcrypt.hash(password, secureSalt);

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

      if (!isQueued) {
        throw new Error('O broker de mensageria recusou o enfileiramento do evento.');
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
      
    } catch (error: any) {
      console.error('❌ Critical asynchronous barrier failure in createUser:', error);
      res.status(500).json({ 
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno de infraestrutura ao tentar despachar a intenção para a fila de eventos.',
          details: error.message
        }
      });
    }
  };
}