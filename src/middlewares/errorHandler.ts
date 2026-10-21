// 1. IMPORTS: Express types for an error-handling middleware and the expected-error class.
import { type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)

/**
 * 🧯 CENTRAL ERROR HANDLER (CWE-209):
 * The last middleware in createApp(). Express sends it every error that a route or a
 * middleware throws, passes to next(error), or returns as a rejected promise (Express 5
 * forwards rejected promises on its own, so handlers no longer need their own try/catch).
 *
 * It answers in one place and in one format, { error: { code, message } }, and never
 * copies an internal error's text, stack trace or file paths into the response.
 * Before, three UserController routes sent error.message to the client, and Express's
 * default handler answered a malformed JSON body with an HTML page holding the full
 * stack trace whenever NODE_ENV was not 'production'.
 *
 * Express recognizes an error handler by its four parameters, so 'next' must stay
 * in the signature even on paths that do not call it.
 */
export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  // Step A: If the response has already started (for example, an SSE stream), it cannot
  // be replaced by a JSON error. Express's default handler then closes the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  // Step B: Expected failures carry a status, a code and a message written for the client.
  if (error instanceof AppError) {
    // Server-side failures (5xx) still go to the log, so an outage stays visible to operators.
    // req.path is logged instead of req.originalUrl, so query strings stay out of the log.
    if (error.statusCode >= 500) {
      logger.warn(
        { component: 'http', method: req.method, path: req.path, status: error.statusCode, code: error.code },
        error.message
      );
    }
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  // Step C: Request bodies that express.json() cannot read: malformed JSON, a body over the
  // size limit or an unsupported charset. body-parser marks these as client errors (4xx status
  // and expose: true). Keep the status, but replace the parser's message, which can quote part
  // of the body or name the parser's internals.
  if (isClientRequestError(error)) {
    res.status(error.status).json({
      error: {
        code: 'INVALID_REQUEST_BODY',
        message: 'The request body could not be read. Check that it is valid JSON within the allowed size.'
      }
    });
    return;
  }

  // Step D: Anything else is unexpected. The full error, stack trace included, goes to the
  // server log only; the client gets a fixed message and no details (CWE-209).
  // 'err' is pino's error key: the line carries the message, stack and the error's own fields,
  // with any personal field (such as a PostgreSQL 'detail' quoting a value) redacted (src/logger.ts).
  logger.error({ component: 'http', method: req.method, path: req.path, err: error }, 'Unhandled failure');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error. Please try again later.'
    }
  });
}

// TYPE GUARD: True for the client errors that body-parser creates with the http-errors package
// (a numeric 4xx 'status' plus 'expose: true'). Inside the guarded branch, TypeScript then
// knows that error.status is a number.
function isClientRequestError(error: unknown): error is { status: number } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}
