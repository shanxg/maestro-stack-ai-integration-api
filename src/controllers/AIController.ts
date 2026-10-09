// 1. IMPORTS: Bring in Express types and the AI service.
import type { Request, Response } from 'express';
import { AIService } from '../services/AIService.js';

export class AIController {
  // Dependency injection: the controller receives the AI service instance in its constructor.
  constructor(private aiService: AIService) {}

  /**
  * 📡 POST /ai/chat:
  * Read and validate the prompt in the request body,
  * then pass it to the local model for processing.
   */
  async chat(req: Request, res: Response): Promise<Response> {
    try {
      const { prompt } = req.body;

      // 📝 VALIDATION: Check that the prompt exists in the JSON payload.
      // If the prompt field is missing, immediately return HTTP 400 (Bad Request).
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_FAILURE',
            message: 'O campo "prompt" é obrigatório e precisa ser uma string de texto válida.'
          }
        });
      }

      // Pass trimmed text to the service layer.
      const aiResponse = await this.aiService.generateResponse(prompt.trim());

      // Return the response processed by Llama 3 with HTTP 200 (OK).
      return res.status(200).json({
        response: aiResponse
      });

    } catch (error) {
      console.error('❌ Erro capturado no método AIController.chat:', error);
      
      // Return HTTP 500 (Internal Server Error) if communication with Ollama fails.
      return res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Falha interna ao processar a resposta do assistente de inteligência artificial.'
        }
      });
    }
  }
}
