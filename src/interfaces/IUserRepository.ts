// 1. IMPORT: Bring in the User structure (ID, name, email) from the models directory.
// Use 'type' because TypeScript interfaces do not appear in emitted JavaScript.
import { type User } from '../models/User.js';

// 2. CONTRACT (INTERFACE): Define the set of required rules.
// Any future database implementation must follow the IUserRepository contract.
export interface IUserRepository {
  // FUNCTION 1: Find and return an array of all saved users,
  // with explicit 'limit' and 'offset' values for pagination.
  findAll(limit: number, offset: number): Promise<User[]>;

  // FUNCTION 2: Accept a string ID and return the matching user or null if it does not exist.
  findById(id: string): Promise<User | null>;

  // FUNCTION 3: Accept an e-mail and return the matching account or null if it does not exist.
  // The login depends on it: the record must carry the password hash (to check the password)
  // and the role (copied into the JWT). It is part of the contract (issue #47), so every
  // implementation must provide it; before, UserService probed for it at runtime with an
  // 'any' cast and answered null when it was missing, which made every login fail with 401.
  findByEmail(email: string): Promise<User | null>;

  // FUNCTION 4: Accept a new user and return it after saving it to the database.
  create(user: User): Promise<User>;
}
