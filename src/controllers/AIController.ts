// 1. IMPORTS: Bring in Express types, the AI service and the request schema.
import type { Request, Response } from 'express';
import { AIService } from '../services/AIService.js';
import { chatSchema } from '../schemas/aiSchema.js';

export class AIController {
  // Dependency injection: the controller receives the AI service instance in its constructor.
  constructor(private aiService: AIService) {}

  /**
   * 📡 POST /api/v1/ai/chat:
   * Read the validated prompt from the request body,
   * then pass it to the configured model for processing.
   */
  async chat(req: Request, res: Response): Promise<Response> {
    // No try/catch: if the model server fails or cannot be reached, the rejected promise
    // goes to the central errorHandler (src/middlewares/errorHandler.ts). AIService turns an
    // unreachable or timed-out server into a 503 AppError; anything else becomes a generic 500.

    // validateMiddleware(chatSchema) has already answered 400 for a missing, blank, non-text or
    // oversized prompt, so this parse only returns the value, with surrounding spaces removed.
    const { prompt } = chatSchema.shape.body.parse(req.body);

    // Pass the validated text to the service layer.
    const aiResponse = await this.aiService.generateResponse(prompt);

    // Return the response processed by the model with HTTP 200 (OK).
    return res.status(200).json({
      response: aiResponse
    });
  }
}
