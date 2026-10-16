// 1. IMPORTS: Bring in Express lifecycle types and the shared token verification.
import { type Request, type Response, type NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenClaims } from '../auth/accessToken.js';
import { readSessionCookie } from '../auth/sessionCookie.js';

// 2. GLOBAL INTERFACE EXTENSION: Tell TypeScript that Express's Request
// object has a '.user' property holding the verified token claims (id, user, email, role).
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
    }
  }
}

// 3. MIDDLEWARE: Acts as a firewall before the request reaches the controller.
// The token comes from one of two places:
// - the HttpOnly session cookie that POST /auth/login sets, used by the browser frontend, whose
//   scripts can no longer read the token (CWE-922, src/auth/sessionCookie.ts);
// - the 'Authorization: Bearer <jwt>' header, used by API clients such as scripts and the tests.
// When a request carries both, the header wins, because the caller chose it explicitly.
export function authMiddleware(req: Request, res: Response, next: NextFunction) {

  // Step A: Read the 'Authorization' header from the HTTP request.
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader) {
    // Step B: Split the 'Bearer' scheme from the token using the space character.
    const parts = authHeader.split(' ');
    const [scheme, headerToken] = parts;

    // Step C: Validate the format: require two non-empty parts and the 'Bearer' scheme.
    if (parts.length !== 2 || !scheme || !headerToken || !/^Bearer$/i.test(scheme)) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token mal formatado'
        }
      });
    }
    token = headerToken;
  } else {
    // Step D: No header: fall back to the session cookie the browser sends by itself.
    token = readSessionCookie(req.headers.cookie);
  }

  // Step E: Reject the request with the standard 401 error when neither carries a token.
  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token não fornecido'
      }
    });
  }

  try {
    // Step F: Verify the token with the shared rules (src/auth/accessToken.ts): HS256 only,
    // this API's issuer and audience, a valid signature and an unexpired "exp" (CWE-347).
    const payload = verifyAccessToken(token);
    
    // Step G: Attach the decoded payload to req.user.
    req.user = payload;
    
    // Step H: Call next() to pass the request to the controller.
    return next();
    
  } catch {
    // Step I: Immediately reject tokens that were altered, have expired, use another algorithm,
    // or were not issued by and for this API.
    // The verification error (for example "invalid signature" or "jwt expired") is NOT sent:
    // telling the caller which check failed helps an attacker tune forged tokens (CWE-209).
    // Every rejected token gets the same response.
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      }
    });
  }
}
