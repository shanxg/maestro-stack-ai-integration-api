// 1. IMPORTS: Bring in the database contract (interface) and User structure.
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';
import bcrypt from 'bcrypt'; // Use bcrypt for secure password hashing
import crypto from 'node:crypto'; // Native, cryptographically secure pseudo-random number generator (CSPRNG)

// 2. SERVICE CLASS: Business rules live here, at the heart of the system.
// It delegates database operations to the repository.
export class UserService {
  // APPSEC CONFIGURATION: Define a robust workload cost factor (12 rounds balances CPU overhead and security)
  private readonly SALT_ROUNDS = 12;
  // DEPENDENCY INJECTION: The constructor does not create the database or repository itself.
  // The caller must provide a repository that implements IUserRepository.
  constructor(private userRepository: IUserRepository) {}

  // FUNCTION 1: Forward the request to the repository to retrieve all users.
  // Pagination is supported through the 'limit' and 'offset' options.
  async getAllUsers(options:{ limit: number; offset: number }): Promise<User[]> {    
    // Extract the two numeric values from the options object.
    const { limit, offset } = options;
  
    // Pass both values to the repository method.
    return this.userRepository.findAll(limit, offset);
  }

  // FUNCTION 2: Ask the repository to find the user with the ID from the route.
  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

   /**
   * 🎯 RESOLVE IDENTITY BY EMAIL (getUserByEmail)
   * Fetches user identity boundaries mapping the unique email index address.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    // Add type-safety casting to adapt the contract execution boundary
    const repositoryWithEmail = this.userRepository as any;
    if (typeof repositoryWithEmail.findByEmail === 'function') {
      return repositoryWithEmail.findByEmail(email);
    }
    return null;
  }

   /**
   * APPSEC SECURE WORKFLOW - CRYPTOGRAPHIC USER PROVISIONING (CWE-256 / CWE-338)
   * 
   * This method secures account creation by enforcing:
   * 1. Cryptographically strong UUID generation instead of predictable PRNG.
   * 2. Slow, adaptive key-stretching password hashing using the Eksblowfish algorithm (bcrypt).
   * 3. Idempotent encryption check: If the password parameter matches a pre-computed Bcrypt 
   *    hash fingerprint, it bypasses re-encryption to eliminate double-hashing malfunctions.
   */
  async createUser(name: string, email: string, password?: string): Promise<User> {
    // Edge-case mitigation: Throw a strict schema error if the authentication string is missing
    if (!password || password.trim() === '') {
      throw new Error('Crucial validation error: Request payload lacks a functional password string.');
    }

    // APPSEC REMEDIATION: Swap out Math.random() for crypto.randomUUID() to bypass predictable sequence indexing
    const safeId = crypto.randomUUID();

    let finalPasswordHash = password;

    // BCRYPT HASH REGEX CHECK: Evaluates if the incoming string payload is already stretched.
    // Standard Bcrypt signatures strictly comply with the following structural layout matching prefix rules: ^\$2[aby]\$.*
    const isAlreadyHashed = /^\$2[aby]\$/.test(password);

    if (!isAlreadyHashed) {
      // If the string is raw text (e.g. from GraphQL mutations), apply stretching rules immediately
      const secureSalt = await bcrypt.genSalt(this.SALT_ROUNDS);
      finalPasswordHash = await bcrypt.hash(password, secureSalt);
    } else {
      console.log(`🔒 [UserService] Pre-computed cryptographic payload detected for: ${email}. Skipping re-encryption layer.`);
    }

    // Assemble the fortified User model structure with zero exposure of plaintext variables
    const newUser: User = {
      id: safeId,
      name,
      email,
      password: finalPasswordHash // Safely map the single-hashed payload to the persistence layer
    };

    return this.userRepository.create(newUser);
  }
}
