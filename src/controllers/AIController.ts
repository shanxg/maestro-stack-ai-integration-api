// 1. IMPORTAÇÕES DE ESCOPO: Puxamos as definições de tipo do Express e o serviço de IA
import type { Request, Response } from 'express';
import { AIService } from '../services/AIService.js';

export class AIController {
  // Injeção de Dependência: O controlador recebe a instância limpa do serviço de IA no construtor
  constructor(private aiService: AIService) {}

  /**
   * 📡 MÉTODO POST /ai/chat:
   * Captura o prompt enviado no corpo da requisição, valida a existência do payload
   * e despacha para o processamento neural do modelo local.
   */
  async chat(req: Request, res: Response): Promise<Response> {
    try {
      const { prompt } = req.body;

      // 📝 CONDIÇÃO VALIDADA: Checa se o prompt existe no payload do JSON.
      // Se o usuário esquecer de enviar a chave "prompt", barra imediatamente com status 400 (Bad Request).
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_FAILURE',
            message: 'O campo "prompt" é obrigatório e precisa ser uma string de texto válida.'
          }
        });
      }

      // Aciona a camada de serviço passando o texto purificado (sem espaços sobressalentes nas pontas)
      const aiResponse = await this.aiService.generateResponse(prompt.trim());

      // Retorna o status 200 (OK) devolvendo a resposta processada pelo Llama 3
      return res.status(200).json({
        response: aiResponse
      });

    } catch (error) {
      console.error('❌ Erro capturado no método AIController.chat:', error);
      
      // Retorna status 500 (Internal Server Error) caso a comunicação com o Ollama falte
      return res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Falha interna ao processar a resposta do assistente de inteligência artificial.'
        }
      });
    }
  }
}
