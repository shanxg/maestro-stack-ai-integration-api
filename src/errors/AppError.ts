/**
 * 🧱 EXPECTED API ERRORS (CWE-209):
 * An AppError is a failure the API knows how to answer. For example, the message broker
 * refused an event, so the request cannot be served right now. Code that hits such a
 * failure throws an AppError instead of building the HTTP response itself.
 *
 * The central error handler (src/middlewares/errorHandler.ts) turns it into the shared
 * JSON error envelope: { error: { code, message } }.
 *
 * SAFE BY CONSTRUCTION: the message is written for the client (in Portuguese, like the
 * other API responses), so the handler can send it as it is. Any other error is treated
 * as unexpected: its text stays in the server log and the client gets a generic 500.
 */
export class AppError extends Error {
  constructor(
    // HTTP status sent to the client (for example, 503 when a dependency is unavailable).
    readonly statusCode: number,
    // Stable machine-readable code; clients branch on it, never on the message text.
    readonly code: string,
    // Human-readable text for the client. Never put internal details here
    // (stack traces, hostnames, SQL or a library's own error message).
    message: string
  ) {
    // Error stores the message and builds the stack trace, which only the server log sees.
    super(message);
    // Shows "AppError" instead of "Error" in stack traces and console output.
    this.name = 'AppError';
  }
}
