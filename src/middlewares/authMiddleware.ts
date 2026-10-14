// 1. IMPORTS: Bring in Express lifecycle types and the JWT library.
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 2. GLOBAL INTERFACE EXTENSION: Tell TypeScript that Express's Request
// object has a '.user' property for storing decoded token data.
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// 🔥 SAFE SECRET RETRIEVAL: Read the secret from the environment and fail closed if it is missing.
// A hardcoded fallback would let anyone who reads the source forge valid tokens (CWE-798).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}
const JWT_SECRET = process.env.JWT_SECRET;

// 3. MIDDLEWARE: Acts as a firewall before the request reaches the controller.
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  
  // Step A: Read the 'Authorization' header from the HTTP request.
  const authHeader = req.headers.authorization;
  
  // Step B: Reject the request with the standard 401 error if the header is missing.
  if (!authHeader) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token não fornecido'
      }
    });
  }

  // Step C: Split the 'Bearer' scheme from the token using the space character.
  const parts = authHeader.split(' ');
  const [scheme, token] = parts;

  // 🔥 STRICT-MODE GUARD: Ensure both values exist before using them.
  if (!scheme || !token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token inválido ou ausente'
      }
    });
  }

  // Step D: Validate the format: require two parts and the 'Bearer' scheme.
  if (parts.length !== 2 || !/^Bearer$/i.test(scheme)) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token mal formatado'
      }
    });
  }

  try {
    // Step E: Verify the signature cryptographically using the secret key.
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Step F: Attach the decoded payload to req.user.
    req.user = payload;
    
    // Step G: Call next() to pass the request to the controller.
    return next();
    
  } catch (error: any) {
    // Step H: Immediately reject tokens that were altered or have expired.
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado',
        details: error.message
      }
    });
  }
}
