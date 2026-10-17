/**
 * 📧 DUPLICATE E-MAIL (issue #50):
 * Thrown by UserRepository.create() when PostgreSQL rejects the insert because the e-mail already
 * has an account (unique_violation, SQLSTATE 23505, on users.email). It is an expected outcome of
 * the asynchronous registration, not a failure: the API has already answered 202 to the request,
 * and on purpose it answers the same 202 whether or not the e-mail is taken, so the registration
 * route does not reveal which e-mails have accounts (CWE-204), as the login does not either.
 *
 * The queue consumer recognizes this class and acknowledges the message (nothing to retry),
 * instead of treating it like a real failure. The message carries no e-mail, so logging the
 * error never writes one (CWE-532).
 */
export class DuplicateEmailError extends Error {
  constructor() {
    super('The e-mail already belongs to an account.');
    // Shows "DuplicateEmailError" instead of "Error" in stack traces and log lines.
    this.name = 'DuplicateEmailError';
  }
}
