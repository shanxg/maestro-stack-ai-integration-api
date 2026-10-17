// 1. IMPORTS: The Express router, authentication, request validation and the controller.
import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateMiddleware } from '../middlewares/validateMiddleware.js';
import { createUserSchema, listUsersSchema, userIdParamsSchema } from '../schemas/userSchema.js';
import { type UserController } from '../controllers/UserController.js';

/**
 * 👥 USER ROUTES (issue #46): reads and registration, moved out of src/app.ts.
 * Every public route lives under /api/v1 (issue #49): one versioned namespace instead of
 * /users, /auth, /ai and /api/v1 side by side, so a future /api/v2 can run next to it.
 * Paths are written in full and the router is mounted at '/', so every route keeps its exact
 * public path and the openapi.yaml inventory test can read it.
 */
export function createUserRouter(userController: UserController): Router {
  const router = Router();

  // Reads require a session; the access rules (admins list, owners read) run in the controller.
  router.get('/api/v1/users', authMiddleware, validateMiddleware(listUsersSchema), userController.getUsers);
  // /api/v1/users/me is registered before /api/v1/users/:id, otherwise Express would read "me" as an id.
  router.get('/api/v1/users/me', authMiddleware, userController.getCurrentUser);
  // The id is validated like any other input (issue #49): blank or too long -> 400 VALIDATION_FAILURE.
  router.get('/api/v1/users/:id', authMiddleware, validateMiddleware(userIdParamsSchema), userController.getUserById);

  // Public registration: validated here, hashed and queued by the controller.
  router.post('/api/v1/users', validateMiddleware(createUserSchema), userController.createUser);

  return router;
}
