// 1. IMPORTS: The JWT library and the validated secret and fixed token settings.
import jwt from 'jsonwebtoken';
import { env, settings } from '../config.js';
import { type UserRole } from '../models/User.js';

/**
 * 🔐 ACCESS TOKENS (CWE-347): the single place that signs and verifies the API's JWTs.
 *
 * Before, POST /api/v1/auth/login signed tokens with only a lifetime, and each consumer (authMiddleware,
 * the Apollo context, the WebSocket blueprint) called jwt.verify(token, secret) on its own,
 * without pinning the algorithm, the issuer or the audience. Any HMAC algorithm signed with the
 * secret was accepted, and so was any token signed with it for another purpose.
 *
 * Now every token is signed with settings.jwt.algorithm (HS256) and carries the issuer ("iss")
 * and audience ("aud") claims from settings.jwt, and verification accepts nothing else:
 * - algorithms: only HS256, so a token whose header names another algorithm is rejected;
 * - issuer: the token must say this API issued it;
 * - audience: the token must say it was issued for this API.
 * jsonwebtoken also checks the expiry ("exp") on every verification.
 */

// The identity claims the API puts in every access token.
export type AccessTokenClaims = {
  id: string;
  user: string;
  email: string;
  role: UserRole;
};

// Sign an access token for a user who has just proved their password.
export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: settings.jwt.algorithm,
    issuer: settings.jwt.issuer,
    audience: settings.jwt.audience,
    expiresIn: settings.jwt.expiresIn,
  });
}

// Verify a token and return its claims. Throws (jsonwebtoken's own errors) when the signature,
// algorithm, issuer, audience or expiry is wrong; callers answer 401 without saying which check failed.
export function verifyAccessToken(token: string): AccessTokenClaims & jwt.JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: [settings.jwt.algorithm],
    issuer: settings.jwt.issuer,
    audience: settings.jwt.audience,
  });

  // jwt.verify returns a string only for tokens whose payload is not a JSON object. The API never
  // signs such tokens, so one can only be forged or foreign: reject it like any other invalid token.
  if (typeof payload === 'string') {
    throw new jwt.JsonWebTokenError('unexpected token payload');
  }

  return payload as AccessTokenClaims & jwt.JwtPayload;
}
