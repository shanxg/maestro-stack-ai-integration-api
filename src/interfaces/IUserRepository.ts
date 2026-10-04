// 1. IMPORTAÇÃO: Traz a estrutura do "User" (ID, nome, email) lá da pasta de modelos.
// Usamos 'type' porque no TypeScript interfaces puras desaparecem quando o código vira JavaScript.
import { type User } from "../models/User.js";

// 2. O CONTRATO (INTERFACE): Define uma lista de regras obrigatórias.
// Qualquer banco de dados que a gente criar no futuro terá que seguir esse molde 'IUserRepository'.
export interface IUserRepository {
  
  // FUNÇÃO 1: Promete buscar e devolver uma lista (Array []) com TODOS os usuários salvos,
  // (PAGINAÇÃO) Exigindo explicitamente 'limit' e 'offset' para fatiar as buscas de dados.
  findAll(limit: number, offset: number): Promise<User[]>;

  // FUNÇÃO 2: Recebe um ID de texto e promete devolver o Usuário encontrado OU 'null' (se ele não existir).
  findById(id: string): Promise<User | null>;

  // FUNÇÃO 3: Recebe os dados de um novo Usuário e promete devolver ele de volta após salvar no banco.
  create(user: User): Promise<User>;
}