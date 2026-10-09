// 1. IMPORTAÇÕES: Traz os tipos de Requisição e Resposta do Express, e a camada de Serviço.
// Usamos 'type' no Request/Response porque eles são apenas tipos estruturais do TypeScript.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { EventBrokerService } from '../services/EventBrokerService.js';

// Biblioteca para conectar e interagir com o Redis
import {Redis} from 'ioredis'; 
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',  // Endereço do servidor Redis
  port: 6379,        // Porta padrão do Redis  
});


// 2. A CLASSE CONTROLADORA: Esta camada é o "porteiro" da nossa API.
// Ela é responsável apenas por receber os dados da internet, chamar o Serviço e devolver uma resposta HTTP.
export class UserController {
  
  // INJEÇÃO DE DEPENDÊNCIA: O controlador não cria o serviço do zero.
  // INVERSÃO DE CONTROLE (IoC): O construtor recebe as instâncias vivas injetadas da Factory principal.
  // Quem chamar o UserController fica encarregado de entregar o UserService e o EventBrokerService prontos.
  constructor(
    private userService: UserService,
    private eventBrokerService: EventBrokerService
  ) {}

  /**
   * 📡 ENDPOINT 1 (GET /users): Listagem de usuários com suporte a Cache-Aside no Redis.
   * Acionada de forma segura para fatiar buscas na persistência do PostgreSQL.
   */
  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      // PAGINAÇÃO COMPORTAMENTAL: Captura os parâmetros contidos na Query String da URL da requisição.
      // Se o desenvolvedor ou cliente omitir os valores, assume limit=10 e offset=0 por convenção corporativa.
      const { limit = '10', offset = '0' } = req.query;

      // PAGINAÇÃO COMPORTAMENTAL: Converte as strings extraídas da URL estritamente para números inteiros.
      // A trava Math.max() impede buracos na paginação com números negativos inseridos maliciosamente.
      const limitNumber = Math.max(1, parseInt(limit as string, 10));
      const offsetNumber = Math.max(0, parseInt(offset as string, 10));

      // CHAVE DINÂMICA DE ISOLAMENTO: Cada combinação de página ganha um bloco exclusivo indexado no Redis!
      const cacheKey = `users:limit=${limitNumber}:offset=${offsetNumber}`;

      // Passo A: Faz um "ping" síncrono no Redis usando a chave dinâmica para checar se o bloco de texto já existe.
      const cachedUsers = await redis.get(cacheKey);      
      
      // Passo B: CONDIÇÃO DE CACHE HIT! Se o texto JSON existir, descompacta os dados e responde ao cliente na hora,
      // economizando ciclos de processamento e conexões de I/O de disco contra o PostgreSQL!
      if (cachedUsers) {
        console.log(`⚡ [Redis] Cache Hit absoluto para a chave: ${cacheKey}`);
        res.status(200).json(JSON.parse(cachedUsers));
        return;
      }
      
      console.log(`⚠️ [Redis] Cache Miss detectado. Perfurando rota até a camada do PostgreSQL...`);

      // Passo C: CONDIÇÃO DE CACHE MISS! Avança até o serviço e puxa os registros originais e reais do banco de dados relacional.
      const users = await this.userService.getAllUsers({ 
        limit: limitNumber, 
        offset: offsetNumber 
      });
      
      // Passo D: Devolve o resultado novo em formato string compactado para a gaveta do Redis,
      // configurando um TTL (Time-To-Live) de expiração explícita de 60 segundos para evitar obsolescência de dados.
      await redis.set(cacheKey, JSON.stringify(users), 'EX', 60);
      
      // Passo E: Entrega os dados limpos e consolidados diretamente para o navegador do cliente.
      res.status(200).json(users);

    } catch (error: any) {
      console.error('❌ Falha crítica de processamento no método getUsers:', error);
       res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Falha operacional de performance interna no servidor de dados.',
          details: error.message
        }
      });
    }
  };

  /**
   * 📡 ENDPOINT 2 (GET /users/:id): Busca cirúrgica por identificador indexado.
   * Varre a persistência do PostgreSQL em busca de um registro único.
   */
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // VALIDAÇÃO DEFENSIVA DE RUNTIME: Se o ID vier em branco ou corrompido pela URL, barra imediatamente.
      // Padrão OWASP: Retorna o objeto envelopado com código semântico legível para o cliente.
      if (!id || typeof id !== 'string' || id.trim() === '') {
         res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'O parâmetro de identificação do Usuário (ID) é mandatório e precisa ser válido.'
          }
        });
        return;
      }

      // Encaminha a busca para a camada do serviço que consome as regras relacionais do Postgres
      const user = await this.userService.getUserById(id.trim());
      
      // CONDIÇÃO DE INTERRUPÇÃO (NOT FOUND): Se o banco responder nulo (registro inexistente), emite o erro 404.
      if (!user) {
        res.status(404).json({ 
          error: {
            code: 'NOT_FOUND',
            message: 'O usuário solicitado não foi localizado na base de dados relacional.'
          }
        });
        return;
      }
      
      // Sucesso total! Devolve o objeto User estruturado e tipado
      res.status(200).json(user);

    } catch (error: any) {
      console.error('❌ Falha crítica no método getUserById:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno ao processar a busca por identificador.',
          details: error.message
        }
      });
    }
  };

  /**
   * 📡 ENDPOINT 3 (POST /users): Envio assíncrono blindado para a fila.
   * Recebe o payload, desvia os bytes para o RabbitMQ e limpa os caches antigos.
   */
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // Captura as chaves estruturadas validadas que atravessaram o middleware do Zod
      const { name, email } = req.body;
      
      // 🛡️ VALIDAÇÃO DE ENTRADA EXIGIDA: Se faltar nome ou email, rejeita o processamento local
      if (!name || !email) {
        res.status(400).json({ 
          error: {
            code: 'BAD_REQUEST',
            message: 'Os campos nome e e-mail são obrigatórios para registrar uma intenção de cadastro.'
          }
        });
        return;
      }

      // =========================================================================
      // 📤 ESTEIRA ASSÍNCRONA ORIENTADA A EVENTOS (RABBITMQ)
      // =========================================================================
      // Aciona o nosso EventBrokerService unificado para disparar o payload em formato
      // de bytes binários direto para a fila do Docker, sem travar a thread de resposta HTTP!
      const isQueued = await this.eventBrokerService.publishEvent('user_created', { name, email });

      // CONDIÇÃO DE PROTEÇÃO DE EVENTOS: Se a fila estiver indisponível ou cair, estoura o erro local
      if (!isQueued) {
        throw new Error('O broker de mensageria recusou o enfileiramento do evento.');
      }

      // =========================================================================
      // 🧹 INVALIDAÇÃO AUTOMÁTICA DE CACHE (PURGE REGEX)
      // =========================================================================
      // Captura e varre todas as chaves dinâmicas registradas com o prefixo "users:*" no Redis.
      // Como um novo usuário entrará na esteira, limpamos o cache imediatamente para garantir
      // que as próximas consultas leiam os dados novos do Postgres, evitando dados fantasmas (*Stale Data*).
      const targetedKeys = await redis.keys('users:*');
      if (targetedKeys.length > 0) {
        await redis.del(...targetedKeys);
        console.log(`🧹 [Redis] Invalidação estrita concluída. ${targetedKeys.length} chaves obsoletas foram expurgadas.`);
      }

      // 🏁 RESPOSTA DE ACEITAÇÃO (STATUS 202 ACCEPTED):
      // Indica ao front-end que a requisição é válida e foi aceita com sucesso total, 
      // mas que o processamento físico no banco acontecerá em background pela fila.
      res.status(202).json({ 
        message: 'Solicitação de cadastro recebida com sucesso! Processando em lote assíncrono na fila de eventos...' 
      });
      
    } catch (error: any) {
      console.error('❌ Falha crítica de barreira assíncrona no método createUser:', error);
      res.status(500).json({ 
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno de infraestrutura ao tentar despachar a intenção para a fila de eventos.',
          details: error.message
        }
      });
    }
  };
}
