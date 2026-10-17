// 1. IMPORTS: Express's cookie option type and the validated environment and fixed settings.
import { type CookieOptions } from 'express';
import { env, settings } from '../config.js';

/**
 * 🍪 BROWSER SESSION COOKIE (CWE-922 / CWE-352):
 * The frontend used to keep the JWT in localStorage, where any script running on the page
 * (an XSS payload included) could read it and send it elsewhere. POST /api/v1/auth/login now puts the
 * token in a cookie that the browser stores and sends by itself:
 * - HttpOnly: page scripts cannot read it, so an XSS cannot steal the session;
 * - SameSite=Strict: the browser does not send it on requests started by another site,
 *   which blocks cross-site request forgery (the Origin check in originCheck.ts adds a second layer);
 * - Secure in production: sent only over https (local development runs on plain http://localhost);
 * - Path=/ and Max-Age equal to the token lifetime, so cookie and token expire together.
 */

// The cookie's name, shared by the login, the logout and authMiddleware.
export const SESSION_COOKIE_NAME = settings.sessionCookie.name;

// The attributes used to set the cookie at login and to clear it at logout. Clearing needs the same
// path, domain and flags, otherwise the browser treats it as a different cookie and keeps the session.
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: settings.sessionCookie.maxAgeSeconds * 1000, // Express takes milliseconds
  };
}

// Read the session token from a raw Cookie header ("a=1; maestro_session=<jwt>; b=2"), or undefined.
// Express 5 has no built-in cookie parser, and the API needs only this one cookie.
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;

    const name = pair.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined; // A malformed escape sequence cannot be a token the API issued
    }
  }
  return undefined;
}
