// 1. IMPORTS: Bring in the repository contract and User data structure.
import { type IUserRepository } from "../interfaces/IUserRepository.js";
import { type User } from "../models/User.js";
import pg from 'pg'; // Use the official 'pg' driver to connect to the relational database.


// 2. CLASS: 'implements IUserRepository' tells TypeScript that this class
// must implement the three methods required by the contract (findAll, findById, create).
export class UserRepository implements IUserRepository {
  private pool: pg.Pool;
  
constructor() {
    // 🔌 INVERSION OF CONTROL (IoC): Initialize the connection pool using container credentials.
    this.pool = new pg.Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'secret',
      database: process.env.POSTGRES_DB || 'postgres',
      port: Number(process.env.POSTGRES_PORT) || 5433,
      max: 10, 
      idleTimeoutMillis: 30000 
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
    
    // Acquire a single dedicated thread connection to run the core DDL transaction safely
    const client = await this.pool.connect();
    try {
      await client.query(createTableQuery);
      console.log('✅ [PostgreSQL] The "users" table is validated and active in the database.');
    } catch (error) {
      console.error('❌ Critical error while initializing the table in PostgreSQL:', error);
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
      console.error('❌ Error executing the findAll query in PostgreSQL:', error);
      return [];
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
      console.error(`❌ Error fetching user with ID ${id} from PostgreSQL:`, error);
      return null;
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
        text: 'SELECT id, name, email, password FROM users WHERE email = \$1;',
        values: [email]
      };

      const result = await this.pool.query(queryConfig);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error(`❌ Error fetching user with email ${email} from PostgreSQL:`, error);
      return null;
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
      console.error('❌ Operational failure while persisting the user in PostgreSQL:', error);
      throw new Error('Internal persistence exception triggered inside repository boundary.');
    }
  }
}


