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
});
