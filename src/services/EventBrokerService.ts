import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { Response } from 'express';

export class EventBrokerService {
  private connection?: ChannelModel;
  private channel?: Channel;
  
  // 👥 ACTIVE CONNECTIONS (SSE TUNNEL):
  // Temporarily store Express Response objects for all connected clients.
  private connectedClients: Response[] = [];
  
  // Unique queue name registered with the RabbitMQ server.
  private readonly queueName = 'user_events';

  constructor() {
    // Automatically establish connections to the Docker infrastructure.
    this.establishInfrastructureBridges();
  }

  /**
  * 🔌 1. ESTABLISH INFRASTRUCTURE BRIDGES (establishInfrastructureBridges):
  * Open persistent TCP connections to RabbitMQ using environment variables.
   */
  private async establishInfrastructureBridges(): Promise<void> {
    try {
      // Read the injected host, or use 'localhost' when running outside the cluster.
      const rabbitHost = process.env.RABBIT_HOST || 'localhost';
      const rabbitUrl = `amqp://${rabbitHost}:5672`;

      console.log(`⏳ [RabbitMQ] Tentando perfurar conexão no endereço: ${rabbitUrl}`);
      
      // Open the main connection and logical data channel.
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();

      // 🛡️ RESILIENCE: Ensure the queue exists before sending any data.
      // durable: true tells RabbitMQ to persist the queue so data survives a container failure.
      await this.channel.assertQueue(this.queueName, { durable: true });
      console.log(`✅ [RabbitMQ] Fila operacional '${this.queueName}' sincronizada com sucesso.`);

      // Start the background consumer once the network connection is ready.
      this.startAsynchronousConsumerWorker();

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Falha crítica de conexão na inicialização do Broker:', error);
    }
  }

  /**
  * 📤 2. MESSAGE PRODUCER (publishEvent):
  * Accept an action from the HTTP controller and publish it to the queue asynchronously.
   */
  async publishEvent(action: string, data: object): Promise<boolean> {
    try {
      // 🛡️ If the channel is offline, abort publishing.
      if (!this.channel) {
        console.warn('⚠️ [RabbitMQ] Tentativa de envio rejeitada: Canal de mensageria offline.');
        return false;
      }

      // Wrap the action and data in a standard JSON payload.
      const payload = { action, data };

      // RabbitMQ requires a buffer of raw bytes.
      // Convert the JavaScript object to a string, then pass it to Buffer.from().
      const messageBuffer = Buffer.from(JSON.stringify(payload));

      // Send the data buffer to the broker.
      // persistent: true tells RabbitMQ to save messages to the container's disk.
      const isPublished = this.channel.sendToQueue(this.queueName, messageBuffer, { persistent: true });
      
      console.log(`📥 [RabbitMQ] Mensagem assíncrona registrada na fila. Ação: "${action}".`);
      return isPublished;

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Falha ao tentar injetar bytes no broker de mensageria:', error);
      return false;
    }
  }

  /**
  * 👷 3. ASYNCHRONOUS CONSUMER WORKER (startAsynchronousConsumerWorker):
  * Continuously listen to the queue in the background.
  * When a message arrives, process it and send a real-time alert over SSE.
   */
  private async startAsynchronousConsumerWorker(): Promise<void> {
    try {
      // 🛡️ Retry if the network channel is not ready yet.
      if (!this.channel) {
        setTimeout(() => this.startAsynchronousConsumerWorker(), 1000);
        return;
      }

      console.log('👷 [Worker] Esteira de consumo ativada em background. Escutando mensagens...');

      // Start continuously reading from the queue.
      await this.channel.consume(this.queueName, (message) => {
        // Ignore null messages, which may result from network instability.
        if (!message) return;

        try {
          // Decode the raw bytes into readable text and parse them as JSON.
          const rawContent = message.content.toString();
          const parsedPayload = JSON.parse(rawContent);

          console.log(`📢 [Worker] Evento retirado da fila. Disparando transmissão em massa...`);

          // 📡 Broadcast the payload to browsers in real time over SSE.
          this.broadcastToSSEClients(parsedPayload.action, parsedPayload.data);

          // 🤝 ACKNOWLEDGEMENT (ACK): Confirm successful processing to RabbitMQ.
          // This allows the broker to safely remove the message from the queue.
          this.channel?.ack(message);

        } catch (error: unknown) {
          console.error('❌ [Worker] Falha operacional ao processar mensagem consumida:', error);
          // Reject corrupted payloads without requeuing them to prevent infinite processing loops.
          this.channel?.nack(message, false, false);
        }
      });

    } catch (error: unknown) {
      console.error('❌ [Worker] Erro crítico no loop de consumo assíncrono:', error);
    }
  }

  /**
  * 📡 4. STREAM REGISTRATION (registerSSEClient):
  * Handle the /events HTTP route, set Server-Sent Events headers,
  * and keep the response open as an active stream.
   */
  registerSSEClient(req: Request | any, res: Response): void {
    // Required W3C headers for continuous one-way text streaming.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow Next.js to read notifications across origins.

    // Send an initial heartbeat to establish the connection with the frontend.
    res.write('data: {"status": "CONNECTED_TO_MAESTRO_STREAM"}\n\n');

    // Add this active connection to the global broadcast list.
    this.connectedClients.push(res);
    console.log(`🔌 [SSE] Cliente acoplado ao túnel. Total de telas conectadas em tempo real: ${this.connectedClients.length}`);

    // 🛡️ MEMORY CLEANUP: Express emits 'close' when the user closes the tab or logs out.
    // Remove the connection from the list to prevent server memory leaks.
    res.on('close', () => {
      this.connectedClients = this.connectedClients.filter(client => client !== res);
      console.log(`❌ [SSE] Conexão abortada pelo navegador. Telas restantes na memória: ${this.connectedClients.length}`);
    });
  }

  /**
  * 📢 5. BROADCAST (broadcastToSSEClients):
  * Send event data to every open response using the SSE syntax.
   */
  private broadcastToSSEClients(event: string, data: any): void {
    // SSE requires this syntax to trigger the browser's event listener: "event: name\ndata: {json}\n\n".
    const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Send the formatted text to every active network connection.
    this.connectedClients.forEach(client => {
      try {
        client.write(formattedData);
      } catch (error: unknown) {
        console.error('⚠️ [SSE] Falha ao injetar dados em canal corrompido:', error);
      }
    });
  }
}
