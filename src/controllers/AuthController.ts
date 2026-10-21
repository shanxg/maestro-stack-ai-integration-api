// 1. IMPORTS: Express types, the login rules, the request schema and the session cookie settings.
import { type Request, type Response } from 'express';
import { type AuthService } from '../services/AuthService.js';
import { loginSchema } from '../schemas/authSchema.js';
// The HttpOnly session cookie (CWE-922); the CSRF Origin check that protects it runs in app.ts (CWE-352).
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/sessionCookie.js';

/**
 * 🔐 AUTH CONTROLLER (issue #46): the HTTP side of POST /api/v1/auth/login and POST /api/v1/auth/logout, moved
 * out of src/app.ts. AuthService holds the rules; this class only reads the request and writes
 * the response (status, cookie, body).
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/login
  login = async (req: Request, res: Response): Promise<void> => {
    // No try/catch here: Express 5 sends a rejected promise (for example, the database lookup
    // failing) to the central errorHandler. validateMiddleware(loginSchema) has already answered
    // 400 for a missing, blank or non-text field, so this parse only returns the values, with the
    // e-mail already trimmed.
    const { username, password } = loginSchema.shape.body.parse(req.body);

    const session = await this.authService.login(username, password);

    // SECURITY POLICY: Unknown e-mails and wrong passwords get the same generic 401 response,
    // so the response body does not reveal which accounts exist either (CWE-204).
    if (!session) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'Invalid credentials. Check the username and password you entered.'
        }
      });
      return;
    }

    // SESSION COOKIE (CWE-922): the token goes into an HttpOnly, SameSite=Strict cookie that page
    // scripts cannot read, and it is not returned in the body, so the frontend never holds it.
    // API clients that need a Bearer token can take it from the Set-Cookie header.
    res.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions());
    res.status(200).json({ user: session.user });
  };

  // POST /api/v1/auth/logout
  // Clears the session cookie with the same attributes it was set with, otherwise the browser keeps
  // it. The JWT inside stays valid until it expires (at most settings.jwt.expiresIn), but the
  // browser no longer sends it. Answering without a session is fine: logging out twice is harmless.
  logout = (_req: Request, res: Response): void => {
    const { maxAge: _lifetime, ...clearOptions } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    res.sendStatus(204);
  };
}
