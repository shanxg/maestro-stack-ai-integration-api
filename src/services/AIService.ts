// 1. SDK IMPORT: Bring in the official OpenAI client listed in package.json.
import OpenAI from 'openai';

export class AIService {
  private openai: OpenAI;
  private modelName: string;

  constructor() {
    // 🔐 INVERSION OF CONTROL (IoC): Initialize the SDK with keys configured in .env.
    // The routing abstraction lets the SDK treat local Ollama like the official OpenAI server.
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'local-ollama-free-key-maestro',
      baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
    });

    // Set the model downloaded on this machine.
    this.modelName = 'llama3';
  }

  /**
  * 🧠 GENERATE A RESPONSE (CHAT COMPLETION):
  * Accept the user's plain-text question, send it to Llama 3,
  * and return the resulting text.
   */
  async generateResponse(prompt: string): Promise<string> {
    try {
      // Security check: reject an empty prompt before sending it.
      if (!prompt || prompt.trim() === '') {
        throw new Error('O prompt enviado para o cérebro da IA não pode estar vazio.');
      }

      // Make the asynchronous request through Ollama's local HTTP endpoint.
      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          { 
            role: 'system', 
            content: 'Você é o Maestro, um assistente virtual sênior inteligente integrado ao ecossistema de dados da API. Responda de forma direta, técnica, profissional e em português brasileiro.' 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        // Temperature 0.2 reduces randomness and favors focused technical responses.
        temperature: 0.2, 
      });

      // Extract the text from the first response choice returned by the model.
      return completion.choices[0]?.message?.content || 'Não foi possível processar uma resposta inteligível.';
    } catch (error) {
      console.error('❌ Erro crítico de comunicação na camada AIService:', error);
      throw new Error('Falha interna ao processar a requisição de Inteligência Artificial.');
    }
  }
}
