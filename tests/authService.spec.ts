// 🔐 AUTH SERVICE AND COMPOSITION ROOT (issue #46)
// AuthService holds the login rules that used to live inside src/app.ts; these tests run them
// without Express. The last test checks that src/app.ts stays a composition root.
import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { describe, beforeAll, it, expect, jest } from '@jest/globals';
import type { User } from '../src/models/User.js';
import { AuthService } from '../src/services/AuthService.js';
import { settings } from '../src/config.js';

describe('AuthService (login rules)', () => {
  // Random per run, like the other suites: no password literal in the repository (Gitleaks).
  const ACCOUNT_PASSWORD = crypto.randomUUID();
  let account: User;

  beforeAll(async () => {
    // Cost factor 4 keeps the suite fast; the dummy hash still uses the configured cost.
    account = { id: 'abc-777', name: 'Lucas Auth', email: 'auth@maestro.test', password: await bcrypt.hash(ACCOUNT_PASSWORD, 4), role: 'ADMIN' };
  });

  // A stand-in for UserService: only the e-mail lookup is used by the login.
  const lookup = () => ({
    getUserByEmail: jest.fn<(email: string) => Promise<User | null>>(async (email) => (email === account.email ? account : null))
  });

  // TEST 1: Verify valid credentials return the session claims and a token signed with them.
  // Condition: The e-mail exists and the password matches its bcrypt hash.
  it('signs a session token for valid credentials', async () => {
    const auth = await AuthService.create(lookup());

    const session = await auth.login(account.email, ACCOUNT_PASSWORD);

    expect(session?.user).toEqual({ id: 'abc-777', user: 'Lucas Auth', email: 'auth@maestro.test', role: 'ADMIN' });
    expect(jwt.decode(session?.token ?? '')).toMatchObject({ id: 'abc-777', role: 'ADMIN', iss: settings.jwt.issuer });
  });

  // TEST 2: Verify an unknown e-mail and a wrong password get the same answer (CWE-204), and both pay
  // the bcrypt cost (CWE-208). Condition: one call per case; bcrypt.compare must run each time.
  it('returns null for an unknown e-mail and for a wrong password, after a bcrypt comparison in both cases', async () => {
    const auth = await AuthService.create(lookup());
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    try {
      await expect(auth.login('nobody@maestro.test', ACCOUNT_PASSWORD)).resolves.toBeNull();
      await expect(auth.login(account.email, crypto.randomUUID())).resolves.toBeNull();

      expect(compareSpy).toHaveBeenCalledTimes(2);
      // The unknown e-mail was compared against the dummy hash, made with the configured cost.
      expect(bcrypt.getRounds(compareSpy.mock.calls[0]?.[1] as string)).toBe(settings.bcryptSaltRounds);
    } finally {
      compareSpy.mockRestore();
    }
  });

  // TEST 3: Verify src/app.ts is only the composition root (issue #46).
  // Condition: Before, app.ts declared every route inline, held the login logic (bcrypt, token
  // signing) and built the three rate limiters; those now live in src/routes/, AuthService and
  // src/middlewares/rateLimiters.ts.
  it('keeps routes, login logic and limiter definitions out of src/app.ts', () => {
    const appSource = fs.readFileSync('src/app.ts', 'utf8');

    expect(appSource).not.toMatch(/\bapp\.(get|post|put|patch|delete)\(/);
    expect(appSource).not.toMatch(/from 'bcrypt'/);
    expect(appSource).not.toMatch(/signAccessToken/);
    expect(appSource).not.toMatch(/\brateLimit\(/);
  });
});
