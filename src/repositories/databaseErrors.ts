// 1. IMPORTS: The PostgreSQL driver (for its DatabaseError class) and the expected-error class.
import pg from 'pg';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)

/**
 * 🩺 DATABASE FAILURE CLASSIFICATION (CWE-392, issue #93):
 * Before, the read methods of UserRepository caught every database error, logged it and
 * returned [] or null. Callers could not tell an outage from an empty result: with PostgreSQL
 * down, GET /api/v1/users answered 200 [] (and cached it for 60 s), GET /api/v1/users/{id} answered 404 and
 * the login answered 401 "invalid credentials". The repository now reports the failure, and
 * this module decides how it reaches the client.
 */

// SQLSTATE classes (the first two characters of a PostgreSQL error code) that mean "the database
// cannot serve requests right now", not "this query is wrong":
// - 08: connection exception (for example, the connection was lost mid-query);
// - 53: insufficient resources (too many connections, disk full, out of memory);
// - 57: operator intervention (server shutting down, starting up, or a query cancelled).
// See https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNAVAILABLE_SQLSTATE_CLASSES = new Set(['08', '53', '57']);

/**
 * True when the database could not be used, as opposed to a query it rejected.
 * - A pg.DatabaseError is an answer from a running server, so its SQLSTATE class decides.
 * - Anything else never got an answer: a refused or reset socket (ECONNREFUSED, ECONNRESET), a
 *   host that cannot be resolved, the pool's connection timeout or "Connection terminated".
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof pg.DatabaseError) {
    return UNAVAILABLE_SQLSTATE_CLASSES.has((error.code ?? '').slice(0, 2));
  }
  return true;
}

/**
 * Turns a failed read into the error the caller should throw:
 * - database unavailable -> AppError 503 DATABASE_UNAVAILABLE. The central errorHandler sends
 *   its client message as it is, so the client knows it can retry later. The original error is
 *   logged here first, because errorHandler logs only the AppError's own message for a 503.
 * - any other failure (for example, a SQL error after a schema change) -> the original error,
 *   which errorHandler logs in full and answers with the generic 500 (CWE-209).
 * The log line names the operation only: no e-mail, id or other query value (CWE-532).
 */
export function databaseReadFailure(operation: string, error: unknown): unknown {
  if (!isDatabaseUnavailable(error)) {
    return error;
  }

  logger.error({ component: 'postgres', operation, err: error }, 'Database unavailable');
  return new AppError(
    503,
    'DATABASE_UNAVAILABLE',
    'The database is temporarily unavailable. Please try again shortly.'
  );
}
