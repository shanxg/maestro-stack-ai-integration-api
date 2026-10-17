// 1. IMPORTS: bcrypt for the password check, the CSPRNG for the dummy hash, token signing and settings.
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { type UserService } from './UserService.js';
import { signAccessToken, type AccessTokenClaims } from '../auth/accessToken.js';
import { settings } from '../config.js';
import { logger } from '../logger.js';

// The signed-in account as the login returns it: exactly the claims the JWT carries
// (id, user = the account's name, email, role), so the two can never drift apart.
export type SessionUser = AccessTokenClaims;

/**
 * 🔐 AUTHENTICATION RULES (issue #46):
 * The login logic that lived inside src/app.ts: find the account, check the password with bcrypt
 * and sign the session token. The HTTP details (body parsing, cookie, status codes) stay in
 * AuthController, so these rules can be tested and reused without Express.
 */
export class AuthService {
  // Only the e-mail lookup is needed, so tests can pass a small stand-in.
  private constructor(
    private readonly userService: Pick<UserService, 'getUserByEmail'>,
    private readonly dummyPasswordHash: string
  ) {}

  /**
   * ⏱️ CONSTANT-TIME LOGIN GUARD (CWE-208):
   * Builds the service with a bcrypt hash of a random throwaway value, computed once with the same
   * cost as real password hashes. When the e-mail is unknown, the login compares against it, so the
   * response takes as long as a wrong password and does not reveal which accounts exist.
   */
  static async create(userService: Pick<UserService, 'getUserByEmail'>): Promise<AuthService> {
    const dummyPasswordHash = await bcrypt.hash(crypto.randomUUID(), settings.bcryptSaltRounds);
    return new AuthService(userService, dummyPasswordHash);
  }

  /**
   * Checks the credentials and, when they are valid, signs the session token.
   * Returns null for an unknown e-mail and for a wrong password alike, so the caller cannot answer
   * them differently (CWE-204). A database failure rejects the promise (503 or 500 in errorHandler).
   */
  async login(username: string, password: string): Promise<{ token: string; user: SessionUser } | null> {
    // NO PERSONAL DATA IN LOGS (CWE-532, issue #53): the attempt is visible, the e-mail is not.
    logger.info({ component: 'auth' }, 'Login attempt received');

    // Locate the account by its unique e-mail; the record carries the bcrypt hash and the role.
    const userRecord = await this.userService.getUserByEmail(username);

    // bcrypt always runs, against the dummy hash when the account does not exist, so unknown
    // e-mails and wrong passwords take the same time (CWE-208).
    const isPasswordValid = await bcrypt.compare(password, userRecord?.password ?? this.dummyPasswordHash);
    if (!userRecord?.password || !isPasswordValid) {
      return null;
    }

    const user: SessionUser = {
      id: userRecord.id,
      user: userRecord.name,
      email: userRecord.email,
      // The account's access level from the users table (USER unless promoted to ADMIN in the
      // database). The access rules in src/auth/userPolicy.ts read it from the verified token.
      role: userRecord.role ?? 'USER'
    };

    // HS256 with the issuer, audience and lifetime from settings.jwt, the same rules authMiddleware
    // checks (src/auth/accessToken.ts).
    const token = signAccessToken(user);
    logger.info({ component: 'auth', userId: user.id }, 'Login succeeded; session token issued');
    return { token, user };
  }
}
