// 1. IMPORTS: Bring in Express request/response types and the service layer.
// Use 'type' for Request/Response because they are TypeScript-only structural types.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';

// Redis client library
import {Redis} from 'ioredis'; 
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',  // Redis server address
  port: 6379,        // Default Redis port
});


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
        console.log(`⚡ [Redis] Cache Hit absoluto para a chave: ${cacheKey}`);
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
      console.error('❌ Falha crítica de processamento no método getUsers:', error);
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
      console.error('❌ Falha crítica no método getUserById:', error);
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
  * Accept the payload, send it to RabbitMQ, and clear stale cache entries.
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // Read the structured keys validated by the Zod middleware.
      const { name, email } = req.body;
      
      // 🛡️ REQUIRED INPUT VALIDATION: Reject the request if name or email is missing.
      if (!name || !email) {
        res.status(400).json({ 
          error: {
            code: 'BAD_REQUEST',
            message: 'Os campos nome e e-mail são obrigatórios para registrar uma intenção de cadastro.'
          }
        });
        return;
      }

      // =========================================================================
      // 📤 ASYNCHRONOUS EVENT PIPELINE (RABBITMQ)
      // =========================================================================
      // Use the unified EventBrokerService to publish the payload as binary data
      // directly to the queue without blocking the HTTP response thread.
      const isQueued = await this.eventBrokerService.publishEvent('user_created', { name, email });

      // If the queue is unavailable, raise an error.
      if (!isQueued) {
        throw new Error('O broker de mensageria recusou o enfileiramento do evento.');
      }

      // =========================================================================
      // 🧹 AUTOMATIC CACHE INVALIDATION (REGEX PURGE)
      // =========================================================================
      // Find every Redis key with the "users:*" prefix.
      // A new user is entering the pipeline, so clear the cache now to ensure
      // future queries read fresh PostgreSQL data instead of stale entries.
      const targetedKeys = await redis.keys('users:*');
      if (targetedKeys.length > 0) {
        await redis.del(...targetedKeys);
        console.log(`🧹 [Redis] Invalidação estrita concluída. ${targetedKeys.length} chaves obsoletas foram expurgadas.`);
      }

      // 🏁 ACCEPTED RESPONSE (HTTP 202):
      // Tell the frontend that the request is valid and accepted,
      // while database processing continues in the background through the queue.
      res.status(202).json({ 
        message: 'Solicitação de cadastro recebida com sucesso! Processando em lote assíncrono na fila de eventos...' 
      });
      
    } catch (error: any) {
      console.error('❌ Falha crítica de barreira assíncrona no método createUser:', error);
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
