// Import the structural validation engine from Zod and the fixed limits from src/config.ts
import { z } from 'zod';
import { settings } from '../config.js';

// VALIDATION SCHEMA (POST /ai/chat): The prompt must be text with at least one visible character
// and at most settings.aiChat.maxPromptLength characters. Every prompt costs model compute, so an
// oversized one is rejected with 400 before it reaches the model (CWE-770 / OWASP LLM10:2025).
export const chatSchema = z.object({
  body: z.object({
    // Surrounding spaces are removed first, so the limits apply to the text the model receives.
    prompt: z.string({
      message: 'O campo "prompt" é obrigatório e precisa ser um texto.'
    })
      .trim()
      .min(1, { message: 'O campo "prompt" não pode ficar em branco.' })
      .max(settings.aiChat.maxPromptLength, {
        message: `O prompt pode ter no máximo ${settings.aiChat.maxPromptLength} caracteres.`
      })
  })
});
