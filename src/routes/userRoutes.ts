// 1. IMPORTS: The Express router, authentication, request validation and the controller.
import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateMiddleware } from '../middlewares/validateMiddleware.js';
import { createUserSchema, listUsersSchema } from '../schemas/userSchema.js';
import { type UserController } from '../controllers/UserController.js';

/**
 * 👥 USER ROUTES (issue #46): reads and registration, moved out of src/app.ts.
 * Paths are written in full and the router is mounted at '/', so every route keeps its exact
 * public path and the openapi.yaml inventory test can read it.
 */
export function createUserRouter(userController: UserController): Router {
  const router = Router();

  // Reads require a session; the access rules (admins list, owners read) run in the controller.
  router.get('/users', authMiddleware, validateMiddleware(listUsersSchema), userController.getUsers);
  // /users/me is registered before /users/:id, otherwise Express would read "me" as an id.
  router.get('/users/me', authMiddleware, userController.getCurrentUser);
  router.get('/users/:id', authMiddleware, userController.getUserById);

  // Public registration: validated here, hashed and queued by the controller.
  router.post('/api/v1/users', validateMiddleware(createUserSchema), userController.createUser);

  return router;
}
