// 1. IMPORTAÇÃO DO SDK: Puxamos o cliente oficial da OpenAI instalado no package.json
import OpenAI from 'openai';

export class AIService {
  private openai: OpenAI;
  private modelName: string;

  constructor() {
    // 🔐 INVERSION OF CONTROL (IoC): Inicializa o SDK lendo as chaves configuradas no arquivo .env.
    // Graças à abstração de rotas, o SDK trata o Ollama local exatamente como se fosse o servidor oficial da OpenAI!
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'local-ollama-free-key-maestro',
      baseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
    });

    // Define o modelo exato que baixamos no computador
    this.modelName = 'llama3';
  }

  /**
   * 🧠 GERAÇÃO DE RESPOSTAS (CHAT COMPLETION):
   * Recebe a pergunta em texto plano enviada pelo usuário, despacha para o motor do Llama 3
   * e retorna a resposta textual interpretada de forma limpa.
   */
  async generateResponse(prompt: string): Promise<string> {
    try {
      // Condição de Segurança: Bloqueia a execução antes de enviar o prompt se a string vier vazia
      if (!prompt || prompt.trim() === '') {
        throw new Error('O prompt enviado para o cérebro da IA não pode estar vazio.');
      }

      // Dispara a chamada assíncrona cruzando a ponte HTTP local do Ollama
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
        // Temperatura 0.2: Reduz a aleatoriedade da escrita (alucinação), focando em respostas técnicas e assertivas
        temperature: 0.2, 
      });

      // Extrai cirurgicamente o conteúdo em formato de texto da primeira opção retornada pelo modelo
      return completion.choices[0]?.message?.content || 'Não foi possível processar uma resposta inteligível.';
    } catch (error) {
      console.error('❌ Erro crítico de comunicação na camada AIService:', error);
      throw new Error('Falha interna ao processar a requisição de Inteligência Artificial.');
    }
  }
}
