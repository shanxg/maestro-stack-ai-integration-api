// 1. IMPORTS: pino (structured JSON logger) and the validated environment (log level).
import { pino, type DestinationStream, type LoggerOptions } from 'pino';
import { env } from './config.js';

/**
 * 🪵 STRUCTURED LOGGER WITHOUT PERSONAL DATA (CWE-532, issue #53):
 * Every module logs through this one pino instance instead of console.*. Before, the login
 * printed the e-mail of every attempt, the queue consumer printed the e-mail of every new
 * account, and failures were printed with whatever an error object happened to hold. Logs are
 * kept longer and read by more people than the database itself, so they must not hold PII.
 *
 * Two layers keep personal data out:
 * 1. Messages never interpolate e-mails, names or passwords; they identify records by id.
 * 2. REDACTION as a safety net: if a field with one of the names below is ever passed in a log
 *    object (for example a whole request body), pino replaces its value with "[REDACTED]" before
 *    the line is written. Paths are exact keys or one level deep ('*.email'), as pino's redaction
 *    does not search arbitrarily deep, which is why rule 1 still matters.
 *
 * Output is one JSON object per line (level, time, msg and fields), ready for a log collector.
 */
export const REDACTED_FIELDS = [
  'password', '*.password',
  'passwordHash', '*.passwordHash',
  'email', '*.email',
  'username', '*.username',
  'name', '*.name',
  'token', '*.token',
  'authorization', '*.authorization', '*.headers.authorization',
  'cookie', '*.cookie', '*.headers.cookie',
  // PostgreSQL errors carry a 'detail' that can quote the offending value, for example
  // 'Key (email)=(...) already exists.' for a duplicate account; it is kept out as well.
  'detail', '*.detail',
];

// Options shared by the application logger and the loggers that tests build.
export const loggerOptions: LoggerOptions = {
  // Lowest severity written: LOG_LEVEL from src/config.ts ('info' by default, 'silent' in tests).
  level: env.LOG_LEVEL,
  // Every line names the service, so lines from the API and other processes can be told apart.
  base: { service: 'maestro-api' },
  redact: { paths: REDACTED_FIELDS, censor: '[REDACTED]' },
};

// Build a logger with the shared options. Without a destination pino writes to stdout;
// tests pass an in-memory stream to read the lines that would have been written.
export function createLogger(destination?: DestinationStream) {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

// The application logger. Each call names its source in a 'component' field, for example
// logger.info({ component: 'rabbitmq' }, 'Queue ready'), instead of the old "[RabbitMQ]" text
// prefixes, so a log collector can filter by it. Every module calls this same instance (no child
// loggers), so a test can watch everything the API logs by spying on its methods.
export const logger = createLogger();
