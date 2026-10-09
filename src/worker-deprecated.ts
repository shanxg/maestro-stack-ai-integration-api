/**
 * @deprecated OBSOLETO: O arquivo src/worker.ts foi descontinuado.
 * A lógica do consumidor assíncrono que continha o loop `channel.consume` 
 * foi embutida no método privado `startAsynchronousConsumerWorker()` 
 * dentro deste serviço, rodando de forma unificada no boot do servidor principal.
 */

// 1. IMPORTAÇÕES: Trazemos as ferramentas de conexão da nossa fila, o repositório em memória
// e o serviço que gerencia as regras de criação de usuários.
import { getRabbitChannel, QUEUE_NAME } from './queue/rabbit-deprecated.js';
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';

// 🔥 ARQUITETURA LIMPA: Importa o 'io' diretamente do nosso arquivo de configuração isolado!
// Colocamos o sufixo '.js' porque estamos usando os Módulos Nativos (ESM) do Node no projeto.
import { io } from './graphql/socket-deprecated.js';

// 2. FUNÇÃO INICIALIZADORA DO MOTOR DO WORKER:
async function startWorker() {
  console.log('👷 Worker iniciado com sucesso! Escutando a fila de eventos...');

  
  try {
    // Passo A: Instanciamos as dependências da nossa arquitetura.
    // O worker precisa do serviço para processar o salvamento, e o serviço precisa do repositório.
    const userRepository = new UserRepository();
    const userService = new UserService(userRepository);

    // Passo B: Abre um canal de transmissão de dados dedicado com o servidor do RabbitMQ.
    const channel = await getRabbitChannel();

    // Passo C: Ativa o consumo de mensagens da fila. A função 'channel.consume' fica ativa em loop eterno,
    // aguardando que novas mensagens caiam na esteira do RabbitMQ para capturá-las.
    channel.consume(QUEUE_NAME, async (message) => {
      
      // Validação de segurança: Verifica se a mensagem capturada não veio vazia ou nula.
      if (message !== null) {
        try {
          // Passo D: Converte o Buffer (dados binários puros enviados pela rede) de volta para uma String,
          // e logo em seguida transforma em um objeto JSON nativo do JavaScript.
          const content = JSON.parse(message.content.toString());
          console.log(`📥 Nova mensagem capturada da fila! Ação identificada: ${content.action}`);

          // Passo E: Roteamento interno. Verifica se a ação enviada pelo Produtor (API) é de fato 'create'.
          if (content.action === 'create') {
            // Extrai as variáveis 'name' e 'email' que estavam envelopadas dentro da propriedade 'data'.
            const { name, email } = content.data;

            console.log(`⏳ Processando dados em segundo plano para o e-mail: ${email}...`);

            // PASSO F (PERSISTÊNCIA REAL): Aciona a camada de negócios para processar a regra,
            // gerar o ID único aleatório e salvar o usuário definitivamente no banco/memória.
            const newUser = await userService.createUser(name, email);
            console.log(`✅ Usuário cadastrado no banco com sucesso via Fila! Novo ID Gerado: ${newUser.id}`);
            
            // 🔥 Passo B (DISPARO WEBSOCKET EM TEMPO REAL): Emite um evento global chamado 'user_created'
            // Todos os navegadores conectados vão receber esse alerta contendo os dados do novo usuário!
            io?.emit('user_created',{
              id: newUser.id,
              name: newUser.name,
              email: newUser.email
            });
          }

          
          // CONFIRMAÇÃO DE RECEBIMENTO (Acknowledgment / Ack):
          // Avisa ao RabbitMQ que a mensagem foi processada com sucesso absoluto. 
          // O RabbitMQ recebe o 'ack' e deleta a mensagem da esteira com segurança para que ela não se repita.
          channel.ack(message);

        } catch (error) {
          console.error('❌ Falha crítica ao tentar processar a mensagem do Worker:', error);
          
          // REJEIÇÃO DE MENSAGEM (Negative Acknowledgment / Nack):
          // Se o JSON vier quebrado ou houver um erro grave de código, avisamos ao RabbitMQ para rejeitar.
          // Os parâmetros (false, false) dizem para NÃO colocar a mensagem de volta na fila principal, 
          // enviando-a diretamente para a Dead-Letter Queue (lixeira de quarentena) para análise de bugs.
          channel.nack(message, false, false);
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro crítico ao tentar conectar e inicializar o motor do Worker:', error);
  }
}

// Inicializa a execução imediata do nosso processo escutador de segundo plano
startWorker();
