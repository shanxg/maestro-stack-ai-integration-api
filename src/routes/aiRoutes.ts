// 1. IMPORTS: The Express router, authentication, request validation and the controller.
import { Router, type RequestHandler } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateMiddleware } from '../middlewares/validateMiddleware.js';
import { chatSchema } from '../schemas/aiSchema.js';
import { type AIController } from '../controllers/AIController.js';

/**
 * 🤖 AI ROUTES (issue #46): the chat endpoint, moved out of src/app.ts.
 * The path is written in full and the router is mounted at '/' (see authRoutes.ts).
 */
export function createAiRouter(aiController: AIController, aiChatLimiter: RequestHandler): Router {
  const router = Router();

  // Order: authMiddleware sets req.user, the limiter counts per account, and chatSchema rejects
  // an oversized prompt before it reaches the model (invalid prompts still count toward the limit).
  router.post('/api/v1/ai/chat', authMiddleware, aiChatLimiter, validateMiddleware(chatSchema), (req, res) => aiController.chat(req, res));

  return router;
}
