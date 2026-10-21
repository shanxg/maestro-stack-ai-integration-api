// 1. IMPORTS: Express lifecycle types and the list of trusted browser origins.
import { type Request, type Response, type NextFunction } from 'express';
import { env } from '../config.js';

// Methods that only read data. Browsers can send them cross-site in ways CORS does not stop
// (links, images), so they must never change state; this API's GET routes do not.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 🛡️ CSRF ORIGIN CHECK (CWE-352):
 * Since the session lives in a cookie (src/auth/sessionCookie.ts), the browser attaches it to
 * requests on its own. SameSite=Strict already keeps it off requests started by other sites; this
 * middleware is the second layer, as OWASP recommends: every state-changing request that comes
 * from a browser page must come from one of the ALLOWED_ORIGINS validated in src/config.ts.
 *
 * Browsers always send the Origin header on cross-origin requests and on POST requests, and a page
 * cannot forge it. Requests without an Origin header come from non-browser clients (curl, scripts,
 * the test suite), which do not carry a victim's cookies, so they are not a CSRF vector.
 */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (SAFE_METHODS.has(req.method) || origin === undefined || env.ALLOWED_ORIGINS.includes(origin)) {
    next();
    return;
  }

  res.status(403).json({
    error: {
      code: 'CSRF_ORIGIN_REJECTED',
      message: 'Request origin not allowed.'
    }
  });
}
