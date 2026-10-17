// 1. IMPORTS: Bring in the database contract (interface) and User structure.
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';
import bcrypt from 'bcrypt'; // Use bcrypt for secure password hashing
import crypto from 'node:crypto'; // Native, cryptographically secure pseudo-random number generator (CSPRNG)
import { settings } from '../config.js';

// 2. SERVICE CLASS: Business rules live here, at the heart of the system.
// It delegates database operations to the repository.
export class UserService {
  // APPSEC CONFIGURATION: bcrypt work factor from src/config.ts, used by hashPassword() and createUserWithPasswordHash()
  private readonly SALT_ROUNDS = settings.bcryptSaltRounds;
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
   * Returns the account with this e-mail, including the password hash and role the login needs.
   * findByEmail is part of IUserRepository (issue #47), so the call is type-checked: the old
   * 'any' cast and runtime probe are gone, and a repository without the method no longer
   * compiles instead of silently answering null (which turned every login into a 401).
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  /**
   * 🔐 PASSWORD HASHING (CWE-916):
   * The only place that turns a plaintext password into a bcrypt hash, with the work factor
   * from src/config.ts. UserController uses it before publishing a registration to the queue,
   * so the plaintext never travels through RabbitMQ.
   */
  async hashPassword(password: string): Promise<string> {
    const secureSalt = await bcrypt.genSalt(this.SALT_ROUNDS);
    return bcrypt.hash(password, secureSalt);
  }

   /**
   * APPSEC SECURE WORKFLOW - CRYPTOGRAPHIC USER PROVISIONING (CWE-256 / CWE-338 / CWE-916)
   *
   * Entry point for passwords that come from outside the API (any caller other than the
   * registration queue; the retired GraphQL mutation was one, see ADR 0001):
   * 1. Cryptographically strong UUID generation instead of predictable PRNG.
   * 2. The password is ALWAYS hashed with bcrypt, even when it looks like a bcrypt hash.
   *    A caller could otherwise store a ready-made hash with a weak cost, skip the password
   *    rules, or have a password that starts with "$2b$" stored as plaintext.
   */
  async createUser(name: string, email: string, password?: string): Promise<User> {
    // Edge-case mitigation: Throw a strict schema error if the authentication string is missing
    if (!password || password.trim() === '') {
      throw new Error('Crucial validation error: Request payload lacks a functional password string.');
    }

    return this.persistUser(name, email, await this.hashPassword(password));
  }

  /**
   * 📥 TRUSTED PATH FOR THE REGISTRATION QUEUE:
   * Used only by the RabbitMQ consumer, whose messages carry the hash that hashPassword()
   * computed in UserController. As a second check, it accepts only a complete bcrypt hash
   * with at least the configured work factor, so a forged queue message cannot store
   * plaintext or a cheap hash.
   */
  async createUserWithPasswordHash(name: string, email: string, passwordHash: string): Promise<User> {
    // A complete bcrypt hash: version, two-digit cost, then 53 characters of salt and digest.
    const bcryptHashFormat = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

    if (!bcryptHashFormat.test(passwordHash) || bcrypt.getRounds(passwordHash) < this.SALT_ROUNDS) {
      throw new Error('Rejected registration event: the password is not a bcrypt hash with the configured cost.');
    }

    return this.persistUser(name, email, passwordHash);
  }

  // Assemble the User model with a CSPRNG identifier and save it; the password is always a hash here.
  private async persistUser(name: string, email: string, passwordHash: string): Promise<User> {
    // APPSEC REMEDIATION: Swap out Math.random() for crypto.randomUUID() to bypass predictable sequence indexing
    const newUser: User = {
      id: crypto.randomUUID(),
      name,
      email,
      password: passwordHash
    };

    return this.userRepository.create(newUser);
  }
}
