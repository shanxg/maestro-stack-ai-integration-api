// 🪵 LOGGER CONFIGURATION (CWE-532, issue #53)
// Checks the shared pino options from src/logger.ts on a logger that writes to memory.
import { Writable } from 'node:stream';
import { describe, it, expect } from '@jest/globals';
import { pino } from 'pino';
import { loggerOptions } from '../src/logger.js';

// Build a logger with the application's options (at 'info', since the suites run with
// LOG_LEVEL=silent) that collects each JSON line it writes.
function memoryLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    }
  });
  return { logger: pino({ ...loggerOptions, level: 'info' }, stream), lines };
}

describe('Logger (personal data redaction)', () => {
  // TEST 1: Verify the redaction safety net replaces personal fields before a line is written.
  // Condition: A log call passes a whole registration body, a nested user, request headers and a
  // PostgreSQL error whose detail quotes the e-mail, as a careless future call could.
  it('writes [REDACTED] instead of e-mails, names, passwords, tokens, cookies and error details', () => {
    const { logger, lines } = memoryLogger();
    const duplicateError = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        code: '23505',
        detail: 'Key (email)=(leaked@maestro.test) already exists.'
      }
    );

    logger.info(
      {
        component: 'test',
        email: 'leaked@maestro.test',
        name: 'Leaked Name',
        password: 'leaked-password-123',
        user: { email: 'leaked@maestro.test', username: 'leaked@maestro.test', token: 'leaked.jwt.here' },
        req: { headers: { authorization: 'Bearer leaked.jwt.here', cookie: 'maestro_session=leaked.jwt.here' } }
      },
      'Registration received'
    );
    logger.error({ component: 'test', err: duplicateError }, 'Failed to persist the user');

    const written = lines.join('');
    for (const secret of ['leaked@maestro.test', 'Leaked Name', 'leaked-password-123', 'leaked.jwt.here']) {
      expect({ secret, written: written.includes(secret) }).toEqual({ secret, written: false });
    }
    expect(written).toContain('[REDACTED]');

    // The rest of the line stays useful: the message, the component and the error code survive.
    const [first, second] = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(first).toMatchObject({
      msg: 'Registration received',
      component: 'test',
      service: 'maestro-api',
      email: '[REDACTED]'
    });
    expect(second).toMatchObject({ msg: 'Failed to persist the user', err: { code: '23505', detail: '[REDACTED]' } });
  });
});
