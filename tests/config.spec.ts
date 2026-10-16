// 1. IMPORTS: Jest utilities and the environment schema from src/config.ts.
// tests/setupEnv.ts has already set the required variables, so importing the module does not stop.
import { describe, it, expect } from '@jest/globals';
import { envSchema } from '../src/config.js';

describe('Environment configuration (src/config.ts)', () => {
  // A complete, valid environment; each test removes or changes one variable.
  const validEnvironment = {
    JWT_SECRET: 'x'.repeat(64),
    POSTGRES_PASSWORD: 'postgres-test-password',
    RABBIT_USER: 'maestro-test',
    RABBIT_PASSWORD: 'rabbit-test-password',
    REDIS_PASSWORD: 'redis-test-password'
  };

  // TEST 1: Verify the reference environment above is accepted, so the next tests fail for one reason only.
  // Condition: Every required variable is set and the optional ones fall back to their defaults.
  it('accepts an environment with every required variable', () => {
    const result = envSchema.safeParse(validEnvironment);

    expect(result.success).toBe(true);
  });

  // TEST 2: Verify the API refuses to start without a Redis password (CWE-306, issue #106).
  // Condition: REDIS_PASSWORD is missing, then empty; both must fail on that variable.
  it('rejects a missing or empty REDIS_PASSWORD', () => {
    const { REDIS_PASSWORD: _removed, ...withoutRedisPassword } = validEnvironment;

    for (const environment of [withoutRedisPassword, { ...validEnvironment, REDIS_PASSWORD: '' }]) {
      const result = envSchema.safeParse(environment);

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('REDIS_PASSWORD');
    }
  });

  // TEST 3: Verify the trusted browser origins come from ALLOWED_ORIGINS (issue #120).
  // Condition: A comma-separated list with spaces around the entries becomes a clean list, so a
  // deployed frontend is trusted through configuration instead of a code change.
  it('reads ALLOWED_ORIGINS as a list of origins', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      ALLOWED_ORIGINS: 'https://app.maestro.example, https://admin.maestro.example:8443'
    });

    expect(result.success).toBe(true);
    expect(result.data?.ALLOWED_ORIGINS).toEqual(['https://app.maestro.example', 'https://admin.maestro.example:8443']);
  });

  // TEST 4: Verify ALLOWED_ORIGINS rejects anything but a bare http(s) origin (CWE-942).
  // Condition: A wildcard, a wildcard subdomain, a path, a trailing slash, another scheme or an
  // empty list must each stop the boot with an error on ALLOWED_ORIGINS.
  it('rejects wildcards, paths, trailing slashes, other schemes and an empty list in ALLOWED_ORIGINS', () => {
    for (const value of ['*', 'https://*.maestro.example', 'https://app.maestro.example/chat', 'https://app.maestro.example/', 'ftp://files.maestro.example', ' , ']) {
      const result = envSchema.safeParse({ ...validEnvironment, ALLOWED_ORIGINS: value });

      expect({ value, success: result.success }).toEqual({ value, success: false });
      expect(result.error?.issues.some((issue) => issue.path[0] === 'ALLOWED_ORIGINS')).toBe(true);
    }
  });

  // TEST 5: Verify that without ALLOWED_ORIGINS only the local development origins are trusted.
  // Condition: The variable is not set, as in local development; a deployment that forgets it fails closed.
  it('trusts only the local development origins when ALLOWED_ORIGINS is not set', () => {
    const result = envSchema.safeParse(validEnvironment);

    expect(result.data?.ALLOWED_ORIGINS).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ]);
  });
});
