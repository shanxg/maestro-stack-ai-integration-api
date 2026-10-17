// 1. IMPORTS: Bring in the repository contract and User data structure.
import { type IUserRepository } from "../interfaces/IUserRepository.js";
import { type User } from "../models/User.js";
import pg from 'pg'; // Use the official 'pg' driver to connect to the relational database.
import { env, settings } from '../config.js'; // Validated database settings (no default password) and pool limits
import { databaseReadFailure } from './databaseErrors.js'; // Outage -> 503, query error -> 500 (CWE-392)
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)

// 2. CLASS: 'implements IUserRepository' tells TypeScript that this class
// must implement the four methods required by the contract (findAll, findById, findByEmail, create).
export class UserRepository implements IUserRepository {
  private pool: pg.Pool;
  
constructor() {
    // 🔌 INVERSION OF CONTROL (IoC): Initialize the connection pool using container credentials.
    this.pool = new pg.Pool({
      host: env.POSTGRES_HOST,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD, // Required: no hardcoded fallback (CWE-1392)
      database: env.POSTGRES_DB,
      port: env.POSTGRES_PORT,
      // Pool size and timeouts live in src/config.ts (settings.database). The connection timeout
      // makes a request fail fast with a 503 when the database host does not answer (issue #93).
      max: settings.database.poolMax,
      idleTimeoutMillis: settings.database.idleTimeoutMs,
      connectionTimeoutMillis: settings.database.connectionTimeoutMs
    });

    // 🧯 IDLE CONNECTION ERRORS (CWE-248, issue #93): when PostgreSQL restarts or the network drops,
    // the pool emits 'error' for the idle connections it holds. Node.js turns an 'error' event with
    // no listener into an uncaught exception, which stopped the whole API. The pool already discards
    // the broken connection and opens a new one on the next query, so logging is all that is needed.
    this.pool.on('error', (error) => {
      logger.error({ component: 'postgres', err: error }, 'An idle connection failed and was discarded');
    });

    // 🛑 REMEDIATION - ANTI-RACE CONDITION BLOCK (OWASP CORE):
    // Removed 'this.initDatabase()' from the constructor execution path.
    // Infrastructure bootstrapping must be explicitly driven and awaited by the server lifecycle engine.
  }

  /**
   * 🏗️ ORCHESTRATED INFRASTRUCTURE INITIALIZATION (initialize):
   * Promotes the database DDL execution to a stateful, awaitable startup sequence.
   * If this asynchronous task fails, it bubbles the exception to immediately halt the server.
   */
  async initialize(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // ACCESS LEVEL (issue #36): every account has a role, USER unless an administrator promotes it
    // directly in the database. ADD COLUMN IF NOT EXISTS upgrades tables created before the column
    // existed, and the CHECK constraint allows only the two roles the API knows.
    const addRoleColumnQuery = `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'USER'
        CHECK (role IN ('USER', 'ADMIN'));
    `;

    // Acquire a single dedicated thread connection to run the core DDL transaction safely
    const client = await this.pool.connect();
    try {
      await client.query(createTableQuery);
      await client.query(addRoleColumnQuery);
      logger.info({ component: 'postgres' }, 'The users table is ready');
    } catch (error) {
      logger.error({ component: 'postgres', err: error }, 'Failed to initialize the users table');
      throw error; // Rethrow to enforce a deterministic runtime crash instead of running in a corrupted state
    } finally {
      client.release(); // Return the resource pool slice back immediately to prevent connection exhaustion
    }
  }
              
  // FUNCTION 1 (paginated findAll): Select a logical slice using the supplied numeric coordinates.  
  /**
   * 🔍 PAGINATED LIST FUNCTION (findAll):
   * Limit the number of returned records and skip earlier records in the SQL query.
   */
  async findAll(limit: number, offset: number): Promise<User[]> {
    
    try {
      // APPSEC REMEDIATION: Using an explicit named configuration object instead of a raw text query
      // forces the PostgreSQL engine to pre-compile the execution plan inside the cluster context.
      const queryConfig: pg.QueryConfig = {
        name: 'fetch-all-users-paginated', // Unique identifier used by the database to cache the query plan
        text: 'SELECT id, name, email FROM users ORDER BY created_at DESC LIMIT \$1 OFFSET \$2;',
        values: [limit, offset] // Strict typing blocks binary command truncation vectors (CWE-89)
      };

      const result = await this.pool.query(queryConfig);
      return result.rows; // Return the rows retrieved from the relational database.
    } catch (error) {
      // REPORT, DO NOT HIDE (CWE-392, issue #93): returning [] here made an outage look like an
      // empty table, and UserController cached that [] for 60 s. Throwing stops the route before
      // the cache write; a database outage becomes a 503, any other failure a generic 500.
      throw databaseReadFailure('findAll', error);
    }
  }

  // FUNCTION 2: Accept an ID and use JavaScript's '.find()' method to search the array.
  /**
   * 🎯 FIND BY ID FUNCTION (findById):
   * Safely locate a record using an indexed parameter.
   */
  async findById(id: string): Promise<User | null> {
    
    try {
      // APPSEC REMEDIATION: Pre-compiling the lookup syntax completely isolates string values
      // from the compiled operation, neutralizing blind SQL injection strings.
      const queryConfig: pg.QueryConfig = {
        name: 'fetch-user-by-id',
        text: 'SELECT id, name, email FROM users WHERE id = \$1;',
        values: [id]
      };

      const result = await this.pool.query(queryConfig);
      return result.rows.length > 0 ? result.rows[0] : null;  // Return the matching user, or null if none exists.
    } catch (error) {
      // null means "no such user" (404), so it must not stand for "the database failed" (CWE-392).
      throw databaseReadFailure('findById', error);
    }
  }

  /**
   * 🔍 FIND BY EMAIL FUNCTION (findByEmail):
   * Safely locate a user record using a unique indexed email primitive configuration.
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const queryConfig: pg.QueryConfig = {
        name: 'fetch-user-by-email',
        // The login needs the hash to check the password and the role to put in the JWT.
        text: 'SELECT id, name, email, password, role FROM users WHERE email = \$1;',
        values: [email]
      };

      const result = await this.pool.query(queryConfig);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      // null made the login answer 401 "invalid credentials" during an outage, so users were told
      // their password was wrong (CWE-392). The log line no longer carries the e-mail (CWE-532).
      throw databaseReadFailure('findByEmail', error);
    }
  }

  // FUNCTION 3: Accept a new user, add it to the array with '.push()', and return it to confirm that it was saved successfully.  
  /**
   * 📥 WRITE FUNCTION (create):
   * Insert the data generated by the service into the corresponding PostgreSQL columns.
   */
  async create(user: User): Promise<User> {
    try {
      // APPSEC REMEDIATION: The data properties are bound at execution phase via named parameters.
      // We expand the statement tree definition matrix to strictly ingest the 4th parameter block primitive (\$4)
      const queryConfig: pg.QueryConfig = {
        name: 'insert-new-user',
        text: 'INSERT INTO users (id, name, email, password) VALUES (\$1, \$2, \$3, \$4) RETURNING id, name, email;',
        values: [user.id, user.name, user.email, user.password]
      };

      const result = await this.pool.query(queryConfig);
      return result.rows[0];
    } catch (error) {
      // A duplicate e-mail fails here with a 'detail' that quotes the address; the logger redacts it (issue #53).
      logger.error({ component: 'postgres', err: error }, 'Failed to persist the user');
      throw new Error('Internal persistence exception triggered inside repository boundary.');
    }
  }
}


