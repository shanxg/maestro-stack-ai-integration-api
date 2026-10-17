// 1. IMPORTS: The Express router, the request validation and the controller.
import { Router, type RequestHandler } from 'express';
import { validateMiddleware } from '../middlewares/validateMiddleware.js';
import { loginSchema } from '../schemas/authSchema.js';
import { type AuthController } from '../controllers/AuthController.js';

/**
 * 🔐 AUTH ROUTES (issue #46): the login and logout endpoints, moved out of src/app.ts.
 * Paths are written in full and the router is mounted at '/', so every route keeps its exact
 * public path and the openapi.yaml inventory test can read it.
 */
export function createAuthRouter(authController: AuthController, loginLimiter: RequestHandler): Router {
  const router = Router();

  // Order: the brute-force limiter counts the attempt first (CWE-307), then the body is validated
  // (CWE-1287), then the controller checks the credentials.
  router.post('/api/v1/auth/login', loginLimiter, validateMiddleware(loginSchema), authController.login);
  router.post('/api/v1/auth/logout', authController.logout);

  return router;
}
