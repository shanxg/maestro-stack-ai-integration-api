// 1. SDK IMPORT: Bring in the official OpenAI client listed in package.json, and its connection error.
import OpenAI, { APIConnectionError } from 'openai';
import { env, settings } from '../config.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)
import { loadPrompt, type PromptFile } from '../ai/promptFile.js'; // Prompts versioned in prompts/ (issue #59)

export class AIService {
  private openai: OpenAI;
  private modelName: string;
  // Read-only so a test (or a future route) can report which prompt version answers.
  readonly systemPrompt: PromptFile;

  constructor() {
    // 🔐 INVERSION OF CONTROL (IoC): Initialize the SDK with the key and URL validated in src/config.ts.
    // The routing abstraction lets the SDK treat local Ollama like the official OpenAI server.
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL
    });

    // The model comes from OPENAI_MODEL (default "llama3", the model downloaded for local Ollama),
    // so switching to a cloud model is a configuration change, not a code change.
    this.modelName = env.OPENAI_MODEL;

    // 📝 VERSIONED SYSTEM PROMPT (issue #59): the instructions the model gets live in
    // prompts/chat-system.md, with a version number, instead of a string literal here. Changing
    // them is a reviewed change of that file, and the log line below says which version is live.
    // A missing or malformed file throws, so the API fails at start-up instead of answering with
    // no instructions.
    this.systemPrompt = loadPrompt('chat-system');
    logger.info(
      { component: 'ai', prompt: this.systemPrompt.id, version: this.systemPrompt.version },
      'System prompt loaded'
    );
  }

  /**
   * 🧠 GENERATE A RESPONSE (CHAT COMPLETION):
   * Accept the user's plain-text question, send it to the configured model,
   * and return the resulting text.
   *
   * LLM SECURITY BOUNDARIES (OWASP LLM01:2025 / LLM02:2025 / LLM10:2025):
   * - The model receives only the fixed system prompt and the user's own prompt: no user records,
   *   no secrets and no tools or function calls. A prompt injection can change the answer's text,
   *   but there is no data for it to leak and no action for it to trigger.
   * - The prompt length is checked by chatSchema (src/schemas/aiSchema.ts) before this method runs.
   * - The answer length (max_tokens) and the waiting time (timeout) come from settings.aiChat.
   */
  async generateResponse(prompt: string): Promise<string> {
    try {
      // Make the asynchronous request through the OpenAI-compatible HTTP endpoint (local Ollama by default).
      const completion = await this.openai.chat.completions.create(
        {
          model: this.modelName,
          messages: [
            {
              role: 'system',
              // The versioned text of prompts/chat-system.md, loaded in the constructor (issue #59).
              content: this.systemPrompt.text
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          // Temperature 0.2 reduces randomness and favors focused technical responses.
          temperature: 0.2,
          // OUTPUT CEILING: the model stops after this many tokens, so one prompt cannot keep
          // the model busy generating an unbounded answer.
          max_tokens: settings.aiChat.maxTokens
        },
        {
          // TIME CEILING: the SDK aborts the HTTP request (with an AbortController) once this
          // many milliseconds pass, so a stuck or overloaded model server cannot hold the request open.
          timeout: settings.aiChat.timeoutMs,
          // No automatic retries: the SDK retries twice by default, which would triple both the
          // waiting time and the load on a model server that is already failing.
          maxRetries: 0
        }
      );

      // Extract the text from the first response choice returned by the model.
      return completion.choices[0]?.message?.content || 'Não foi possível processar uma resposta inteligível.';
    } catch (error) {
      // MODEL SERVER UNAVAILABLE: APIConnectionError covers a server that cannot be reached and,
      // through its APIConnectionTimeoutError subclass, a request that hit the timeout above.
      // That is an outage, not a bug: answer 503 so the client knows it can try again later.
      // The connection details stay in the server log; the client gets the AppError message.
      if (error instanceof APIConnectionError) {
        logger.warn({ component: 'ai', reason: error.message }, 'Model server unavailable or too slow');
        throw new AppError(
          503,
          'AI_SERVICE_UNAVAILABLE',
          'O assistente de IA está indisponível no momento. Tente novamente em instantes.'
        );
      }

      // Any other failure (for example, a model name the server does not know) is unexpected:
      // the central errorHandler logs it in full and answers a generic 500.
      throw error;
    }
  }
}
