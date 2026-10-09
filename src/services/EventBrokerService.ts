import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { Response } from 'express';

export class EventBrokerService {
  private connection?: ChannelModel;
  private channel?: Channel;
  
  // 👥 GAVETA DE CONEXÕES ATIVAS (TÚNEL SSE):
  // Armazena temporariamente os objetos 'Response' do Express de todos os clientes logados na aplicação.
  private connectedClients: Response[] = [];
  
  // Nome único da fila registrado no servidor central do RabbitMQ
  private readonly queueName = 'user_events';

  constructor() {
    // Dá a partida automática na fiação física de conexões com a infraestrutura do Docker
    this.establishInfrastructureBridges();
  }

  /**
   * 🔌 1. ESTABELECER PONTES DE INFRAESTRUTURA (establishInfrastructureBridges):
   * Abre conexões TCP permanentes com o RabbitMQ aproveitando as variáveis elásticas de ambiente.
   */
  private async establishInfrastructureBridges(): Promise<void> {
    try {
      // Captura o Host injetado dinamicamente ou assume 'localhost' se estiver rodando fora do cluster
      const rabbitHost = process.env.RABBIT_HOST || 'localhost';
      const rabbitUrl = `amqp://${rabbitHost}:5672`;

      console.log(`⏳ [RabbitMQ] Tentando perfurar conexão no endereço: ${rabbitUrl}`);
      
      // Abre a conexão matriz e o canal lógico de tráfego de dados
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();

      // 🛡️ GARANTIA DE RESILIÊNCIA: Assegura que a fila exista no broker antes do envio de qualquer byte.
      // durable: true -> Diz ao RabbitMQ para persistir a estrutura em disco para não perder dados se o contêiner cair!
      await this.channel.assertQueue(this.queueName, { durable: true });
      console.log(`✅ [RabbitMQ] Fila operacional '${this.queueName}' sincronizada com sucesso.`);

      // Dispara a escuta automática do consumidor em background assim que a fiação de rede estiver pronta
      this.startAsynchronousConsumerWorker();

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Falha crítica de conexão na inicialização do Broker:', error);
    }
  }

  /**
   * 📤 2. PRODUTOR DE MENSAGENS (publishEvent):
   * Recebe uma intenção/ação do controlador HTTP e publica na fila de forma assíncrona em milissegundos.
   */
  async publishEvent(action: string, data: object): Promise<boolean> {
    try {
      // 🛡️ CONDIÇÃO VALIDADA: Se o canal estiver offline por oscilação física, aborta o disparo
      if (!this.channel) {
        console.warn('⚠️ [RabbitMQ] Tentativa de envio rejeitada: Canal de mensageria offline.');
        return false;
      }

      // Envelopa a ação e os dados em um payload JSON padronizado
      const payload = { action, data };

      // O RabbitMQ exige o tráfego em formato de Buffer de Bytes binários puros. 
      // Converte o objeto do JS para String e injeta no construtor Buffer.from()
      const messageBuffer = Buffer.from(JSON.stringify(payload));

      // Despacha o buffer de dados para a esteira do broker
      // persistent: true -> Força o RabbitMQ a salvar os pacotes de dados no HD do contêiner
      const isPublished = this.channel.sendToQueue(this.queueName, messageBuffer, { persistent: true });
      
      console.log(`📥 [RabbitMQ] Mensagem assíncrona registrada na fila. Ação: "${action}".`);
      return isPublished;

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Falha ao tentar injetar bytes no broker de mensageria:', error);
      return false;
    }
  }

  /**
   * 👷 3. WORKER CONSUMIDOR ASSÍNCRONO (startAsynchronousConsumerWorker):
   * Roda em uma thread em background escutando a fila de forma ininterrupta. 
   * Quando uma mensagem surge, processa os dados e despacha o alerta em tempo real via SSE.
   */
  private async startAsynchronousConsumerWorker(): Promise<void> {
    try {
      // 🛡️ VALIDAÇÃO DE CONDIÇÃO: Aguarda de forma recursiva caso o canal de rede atrase para ligar
      if (!this.channel) {
        setTimeout(() => this.startAsynchronousConsumerWorker(), 1000);
        return;
      }

      console.log('👷 [Worker] Esteira de consumo ativada em background. Escutando mensagens...');

      // Ativa o loop contínuo de leitura da fila
      await this.channel.consume(this.queueName, (message) => {
        // Se a mensagem capturada vier nula por instabilidade de rede, ignora e avança
        if (!message) return;

        try {
          // Decodifica os bytes binários brutos de volta para texto legível e reconverte em JSON
          const rawContent = message.content.toString();
          const parsedPayload = JSON.parse(rawContent);

          console.log(`📢 [Worker] Evento retirado da fila. Disparando transmissão em massa...`);

          // 📡 PONTE EM TEMPO REAL DEFINITIVA: Despeja o payload diretamente nos navegadores via SSE!
          this.broadcastToSSEClients(parsedPayload.action, parsedPayload.data);

          // 🤝 ACKNOWLEDGEMENT (ACK): Envia um carimbo de sucesso ao RabbitMQ.
          // Isso autoriza o broker a apagar a mensagem da fila com segurança, sabendo que ela foi cumprida.
          this.channel?.ack(message);

        } catch (error: unknown) {
          console.error('❌ [Worker] Falha operacional ao processar mensagem consumida:', error);
          // Se o payload estiver corrompido, rejeita sem reinserir na fila para evitar loops infinitos de travamento
          this.channel?.nack(message, false, false);
        }
      });

    } catch (error: unknown) {
      console.error('❌ [Worker] Erro crítico no loop de consumo assíncrono:', error);
    }
  }

  /**
   * 📡 4. REGISTRO DE STREAMING (registerSSEClient):
   * Intercepta a rota HTTP /events comum, injeta os cabeçalhos do protocolo Server-Sent Events
   * e mantém a resposta aberta por tempo indeterminado transformando-a em um canal de Stream ativo.
   */
  registerSSEClient(req: Request | any, res: Response): void {
    // Cabeçalhos mandatórios exigidos pelo W3C para habilitar streaming unidirecional de texto contínuo
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Elimina bloqueios de CORS para o Next.js ler as notificações

    // Descarrega o pulso elétrico inicial de batimento cardíaco para selar o aperto de mão com o front-end
    res.write('data: {"status": "CONNECTED_TO_MAESTRO_STREAM"}\n\n');

    // Insere o canal ativo desse usuário na lista global de transmissão
    this.connectedClients.push(res);
    console.log(`🔌 [SSE] Cliente acoplado ao túnel. Total de telas conectadas em tempo real: ${this.connectedClients.length}`);

    // 🛡️ LIMPEZA DE MEMÓRIA (GARANTIA FINOPS): Se o usuário fechar a aba ou deslogar, o Express dispara o evento 'close'.
    // Removemo-lo da lista para impedir vazamentos de memória RAM (*Memory Leaks*) no servidor.
    res.on('close', () => {
      this.connectedClients = this.connectedClients.filter(client => client !== res);
      console.log(`❌ [SSE] Conexão abortada pelo navegador. Telas restantes na memória: ${this.connectedClients.length}`);
    });
  }

  /**
   * 📢 5. TRANSMISSÃO EM MASSA (broadcastToSSEClients):
   * Varre a lista de respostas abertas e injeta os dados do evento seguindo a sintaxe rigorosa do SSE.
   */
  private broadcastToSSEClients(event: string, data: any): void {
    // O protocolo SSE exige a sintaxe estrita: "event: nome\ndata: {json}\n\n" para ativar o escutador do navegador
    const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Dispara o loop descarregando a string de texto em todos os soquetes ativos de rede simultaneamente
    this.connectedClients.forEach(client => {
      try {
        client.write(formattedData);
      } catch (error: unknown) {
        console.error('⚠️ [SSE] Falha ao injetar dados em canal corrompido:', error);
      }
    });
  }
}
