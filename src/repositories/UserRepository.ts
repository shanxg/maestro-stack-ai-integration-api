// 1. IMPORTAÇÕES: Traz o contrato (molde) que criamos e a estrutura de dados do Usuário.
import { type IUserRepository } from "../interfaces/IUserRepository.js";
import { type User } from "../models/User.js";
import pg from 'pg'; // Usamos o driver oficial 'pg' para conexão física com o banco relacional


// 2. A CLASSE: O 'implements IUserRepository' avisa ao TypeScript que esta classe 
// é OBRIGADA a programar e respeitar as 3 funções exigidas pelo contrato (findAll, findById, create).
export class UserRepository implements IUserRepository {
  private pool: pg.Pool;
  
  constructor() {
    // 🔌 INVERSION OF CONTROL (IoC): Inicializa o pool de conexões lendo as credenciais do contêiner.
    // Mapeia a porta interna 5432 dentro do Docker ou a porta externa 5433 que salvou o nosso ambiente!
    this.pool = new pg.Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'secret',
      database: process.env.POSTGRES_DB || 'postgres',
      port: Number(process.env.POSTGRES_PORT) || 5433,
      max: 10, // Limite máximo de conexões simultâneas no pool para evitar vazamento de memória
      idleTimeoutMillis: 30000 // Fecha conexões inativas após 30 segundos para economizar hardware
    });

    this.initDatabase();
  }

  /**
   * 🏗️ INICIALIZAÇÃO DE INFRAESTRUTURA (DDL):
   * Cria a tabela física de usuários de forma automatizada no boot do servidor se ela não existir.
   */
  private async initDatabase(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
      await this.pool.query(createTableQuery);
      console.log('✅ [PostgreSQL] Tabela "users" validada e ativa no banco de dados.');
    } catch (error) {
      console.error('❌ Erro crítico ao tentar inicializar a tabela no PostgreSQL:', error);
    }
  }
              
  // // FUNÇÃO 1 (findAll Pagina): Executa o recorte lógico com base nas coordenadas numéricas recebidas.
  // async findAll(limit: number, offset: number): Promise<User[]> {
  //   // .slice(offset, offset + limit) extrai o intervalo exato de dados pedidos da esteira.
  //   // Exemplo: offset = 10, limit = 10 -> extrai os dados localizados da posição 10 até a 20.
  //   return this.users.slice(offset, offset + limit);
  // }

  /**
   * 🔍 FUNÇÃO LISTAR PAGINADA (findAll):
   * Executa a busca SQL limitando o tamanho dos registros retornados e pulando registros passados.
   */
  async findAll(limit: number, offset: number): Promise<User[]> {
    const selectQuery = 'SELECT id, name, email FROM users ORDER BY created_at DESC LIMIT \$1 OFFSET \$2;';
    try {
      const result = await this.pool.query(selectQuery, [limit, offset]);
      return result.rows; // Retorna o array de linhas nativas extraídas do banco relacional
    } catch (error) {
      console.error('❌ Erro ao executar query findAll no PostgreSQL:', error);
      return [];
    }
  }

  // // FUNÇÃO 2: Recebe um ID e usa o método '.find()' do JavaScript para procurar no array.
  // // Se achar, devolve o usuário. Se não achar, o operador '|| null' garante que retorne nulo.
  // async findById(id: string): Promise<User | null> {
  //   return this.users.find((u) => u.id === id) || null;
  // }

  /**
   * 🎯 FUNÇÃO BUSCAR POR ID (findById):
   * Localiza um registro de forma segura filtrando por parâmetro indexado.
   */
  async findById(id: string): Promise<User | null> {
    const selectByIdQuery = 'SELECT id, name, email FROM users WHERE id = \$1;';
    try {
      const result = await this.pool.query(selectByIdQuery, [id]);
      return result.rows[0] || null; // Devolve o usuário encontrado ou nulo se não existir
    } catch (error) {
      console.error(`❌ Erro ao buscar usuário pelo ID ${id} no PostgreSQL:`, error);
      return null;
    }
  }

  // // FUNÇÃO 3: Recebe um novo usuário pronto, joga ele para dentro do nosso array com o '.push()'
  // // e depois devolve o próprio usuário para confirmar que ele foi salvo com sucesso.
  // async create(user: User): Promise<User> {
  //   this.users.push(user);
  //   return user;
  // } 
  
  /**
   * 📥 FUNÇÃO GRAVAR (create):
   * Insere os dados definitivos gerados pelo serviço nas colunas correspondentes do Postgres.
   */
  async create(user: User): Promise<User> {
    const insertQuery = 'INSERT INTO users (id, name, email) VALUES (\$1, \$2, \$3) RETURNING id, name, email;';
    try {
      const result = await this.pool.query(insertQuery, [user.id, user.name, user.email]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Falha operacional ao tentar persistir usuário no PostgreSQL:', error);
      throw new Error('Erro interno de gravação na camada de persistência relacional.');
    }
  }
}


