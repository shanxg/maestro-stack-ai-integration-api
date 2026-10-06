// 1. IMPORTAÇÕES: Traz os tipos de Requisição e Resposta do Express, e a camada de Serviço.
// Usamos 'type' no Request/Response porque eles são apenas tipos estruturais do TypeScript.
import { type Request, type Response } from 'express';
import { UserService } from '../services/UserService.js';
import { getRabbitChannel, QUEUE_NAME } from '../queue/rabbit.js';

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
  // Ele recebe o 'UserService' já prontinho e configurado através do seu construtor.
  constructor(private userService: UserService) {}

  // <OLD>
  // FUNÇÃO 1 (Listar): Acionada quando alguém acessa a rota GET /users.
  // Ela pede a lista para o serviço e responde ao cliente enviando um JSON com todos os usuários.

        // getUsers = async (req: Request, res: Response): Promise<void> => {
        //   const users = await this.userService.getAllUsers();
        //   res.json(users);
        // };
  // </OLD>      


  // FUNÇÃO 1 (Listar): Método ENDPOINT usando CACHE com Redis. 
  // Acionada quando alguém acessa a rota GET /users.
  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      // PAGINAÇÃO: 1. Captura os parâmetros da URL. Se não forem informados, assume limit=10 e offset=0
      const { limit = '10', offset = '0' } = req.query;

      // PAGINAÇÃO: 2. Converte as strings da URL obrigatoriamente para números inteiros
      const limitNumber = Math.max(1, parseInt(limit as string, 10));
      const offsetNumber = Math.max(0, parseInt(offset as string, 10));

      // CHAVE DINÂMICA: Cada combinação de página ganha um espaço exclusivo no Redis!
      const cacheKey = `users:limit=${limitNumber}:offset=${offsetNumber}`;

      // Passo A: Faz um "ping" no Redis usando a chave dinâmica para ver se o bloco de texto já existe lá dentro
      const cachedUsers = await redis.get(cacheKey);      
      
      // Passo B: Cache Encontrado (Cache Hit)! Converte a string JSON de volta para objeto e responde imediatamente
      if (cachedUsers) {
        res.json(JSON.parse(cachedUsers));
        return;
      }
      
      // Passo C: Cache Não Encontrado (Cache Miss)! Avança mais fundo para as camadas do motor de serviço
      // PAGINAÇÃO: 3. Solicita os dados para a camada de serviço passando as regras de paginação
      const users = await this.userService.getAllUsers({ 
        limit: limitNumber, 
        offset: offsetNumber 
      });
      
      // Passo D: Guarda o bloco especifico de usuarios atualizado de volta no Redis 
      // com um tempo de expiração explícito de 60 segundos (TTL)
      await redis.set(cacheKey, JSON.stringify(users), 'EX', 60);
      
      // Passo E: Entrega os dados diretamente para o navegador do cliente
      res.json(users);
    } catch (error: any) {
      // Passo F: Bloco de salvaguarda em tempo de execução para capturar quedas de rede com formato de erro padronizado
       res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server performance failure',
          details: error.message
        }
      });
    }
  };

  // FUNÇÃO 2 (Buscar por ID): Acionada quando alguém acessa GET /users/:id.
  getUserById = async (req: Request, res: Response): Promise<void> => {
    // Pega o ID enviado na URL da requisição (ex: /users/7z8x9w2)
    const { id } = req.params;

    // VALIDAÇÃO DE SEGURANÇA: Se o ID não foi enviado ou não for um texto válido,
    // o controlador barra a requisição na hora com o erro 400 (Bad Request) e interrompe com 'return'.
    if (!id || typeof id !== 'string') {
       res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid or missing user ID'
        }
      });
      return;
    }

    // Se o ID passou na validação, chama o serviço para procurar o usuário.
    const user = await this.userService.getUserById(id);
    
    // Se o serviço não encontrar o usuário (retornar null), responde com o famoso erro 404 (Not Found).
    if (!user) {
      res.status(404).json({ 
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
      return;
    }
    
    // Se tudo deu certo, devolve o usuário encontrado em formato JSON.
    res.json(user);
  };

  // FUNÇÃO 3 (Criar com Fila Assíncrona): Acionada quando alguém envia dados via POST /users.
  createUser = async (req: Request, res: Response): Promise<void> => {
    // Desestrutura e extrai o 'name' e o 'email' que o cliente enviou dentro do corpo da requisição (body).
    const { name, email } = req.body;
    
    // VALIDAÇÃO: Se o cliente esqueceu de enviar o nome ou o email, barra com o erro 400.
    if (!name || !email) {
      res.status(400).json({ 
        error: {
          code: 'BAD_REQUEST',
          message: 'Name and email are required'
        }
      });
      return;
    }

    try {
      // 1. CONEXÃO COM A FILA: Pega o canal de comunicação ativo que configuramos para o RabbitMQ.
      const channel = await getRabbitChannel();

      // 2. MONTAGEM DO PACOTE (PAYLOAD): Cria o objeto JSON contendo a intenção ("create") e os dados enviados pelo cliente.
      const payload = {
        action: 'create',
        data: { name, email }
      };

      // 3. ENVIO PARA A FILA: Transmite os dados para a fila convertidos em formato binário (Buffer.from).
      // A opção 'persistent: true' diz para o RabbitMQ salvar o arquivo em disco para que ele não se perca se o Docker cair.
      channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
        persistent: true
      });

      // INVALIDAÇÃO AUTOMÁTICA DE CACHE:
      // Deletamos todas as chave dinamicas com "users:" do Redis. Como um usuário novo vai entrar na fila para ser criado,
      // limpamos o cache para garantir que o próximo GET busque a lista atualizada direto do serviço.
      const keys = await redis.keys('users:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      // 4. RESPOSTA DE ACEITAÇÃO (Status 202): Indica ao cliente que a requisição foi recebida com sucesso
      // e aceita para processamento, mas será resolvida em segundo plano de forma assíncrona pela fila.
      res.status(202).json({ 
        message: 'Solicitação de cadastro recebida com sucesso! Processando na fila de eventos...' 
      });
      
    } catch (error: any) {
      // SALVAGUARDA: Se o servidor do RabbitMQ estiver desligado ou a rede falhar, captura o erro e responde com status 500.
      res.status(500).json({ 
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno ao tentar enviar a solicitação para a fila.',
          details: error.message
        }
      });
    }
  };

}
