// Import the structural validation engine from Zod and the fixed limits from src/config.ts
import { z } from 'zod';
import { settings } from '../config.js';

// VALIDATION SCHEMA (POST /api/v1/ai/chat): The prompt must be text with at least one visible character
// and at most settings.aiChat.maxPromptLength characters. Every prompt costs model compute, so an
// oversized one is rejected with 400 before it reaches the model (CWE-770 / OWASP LLM10:2025).
export const chatSchema = z.object({
  body: z.object({
    // Surrounding spaces are removed first, so the limits apply to the text the model receives.
    prompt: z
      .string({
        message: 'The "prompt" field is required and must be a string.'
      })
      .trim()
      .min(1, { message: 'The "prompt" field cannot be blank.' })
      .max(settings.aiChat.maxPromptLength, {
        message: `The prompt can have at most ${settings.aiChat.maxPromptLength} caracteres.`
      })
  })
});
