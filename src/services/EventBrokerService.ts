import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { Response } from 'express';
import { UserService } from './UserService.js'; // Ensure the user service is imported at the top layer

export class EventBrokerService {
  private connection?: ChannelModel;
  private channel?: Channel;
  
  // 👥 ACTIVE CONNECTIONS (SSE TUNNEL):
  // Temporarily store Express Response objects for all connected clients.
  private connectedClients: Response[] = [];
  
  // Unique queue name registered with the RabbitMQ server.
  private readonly queueName = 'user_events';

  constructor(private userService?: UserService) {
    if (userService) {
      this.userService = userService;
    }
    // Automatically establish connections to the Docker infrastructure.
    this.establishInfrastructureBridges();
  }

  /**
   * 🔌 1. ESTABLISH INFRASTRUCTURE BRIDGES (establishInfrastructureBridges):
   * Open persistent TCP connections to RabbitMQ using environment variables.
   * 
   * ARCHITECTURAL REMEDIATION - ASYNCHRONOUS RETRY LOOP (CWE-770 / RESILIENCE):
   * Implements a deterministic re-connection cycle to shield the application from crashes
   * during cluster warm-up delays. If Erlang's opening handshake fails on early boot phases, 
   * the connection engine catches the exception and schedules a new attempt every 5 seconds.
   */
  private async establishInfrastructureBridges(): Promise<void> {
    // Read the injected host, or use 'localhost' when running outside the cluster.
    const rabbitHost = process.env.RABBIT_HOST || 'localhost';
    const rabbitUrl = `amqp://${rabbitHost}:5672`;

    console.log(`⏳ [RabbitMQ] Attempting to establish a connection at: ${rabbitUrl}`);
    
    try {
      // Open the main connection and logical data channel.
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();

      // 🛡️ RESILIENCE: Ensure the queue exists before sending any data.
      await this.channel.assertQueue(this.queueName, { durable: true });
      console.log(`✅ [RabbitMQ] Queue '${this.queueName}' is operational and synchronized successfully.`);

      // Start the background consumer once the network connection is ready.
      this.startAsynchronousConsumerWorker();

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Connection attempt failed. Broker might still be warming up.');
      console.log('⏳ [RabbitMQ] Scheduling a new network handshake attempt in 5 seconds...');
      
      // Schedule a recurring micro-task loop to recover the connection channel automatically
      setTimeout(() => {
        this.establishInfrastructureBridges();
      }, 5000);
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
        console.warn('⚠️ [RabbitMQ] Send attempt rejected: Messaging channel is offline.');
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
      
      console.log(`📥 [RabbitMQ] Asynchronous message added to the queue. Action: "${action}".`);
      return isPublished;

    } catch (error: unknown) {
      console.error('❌ [RabbitMQ] Failed to send bytes to the message broker:', error);
      return false;
    }
  }

  /**
  * 👷 3. ASYNCHRONOUS CONSUMER WORKER (startAsynchronousConsumerWorker):
  * Continuously listen to the queue in the background.
  * When a message arrives, parse it, execute asymmetric writing to PostgreSQL and trigger SSE alerts.
   */
  private async startAsynchronousConsumerWorker(): Promise<void> {
    try {
      if (!this.channel) {
        setTimeout(() => this.startAsynchronousConsumerWorker(), 1000);
        return;
      }

      console.log('👷 [Worker] Background consumer started. Listening for messages...');

      await this.channel.consume(this.queueName, async (message) => {
        if (!message) return;

        try {
          const rawContent = message.content.toString();
          const parsedPayload = JSON.parse(rawContent);

          console.log(`📢 [Worker] Event retrieved from the queue. Processing data pipeline...`);

          // =========================================================================
          // ⚙️ ASYNCHRONOUS SERVICE LAYER PERSISTENCE INGESTION
          // =========================================================================
          // Extrapolate the safe cryptographically protected credentials block sent from the controller boundary
          if (parsedPayload.action === 'user_created') {
            const { name, email, password } = parsedPayload.data;
            
            // APPSEC REMEDIATION - EVENT CONSUMPTION INGESTION ACTIVATION
            // Invoke the domain service instance directly by cascading the hashed password token downstream.
            // Our updated UserService layer will notice the hash signature and prevent double-hashing natively.
            if (this.userService) {
              console.log(`📥 [Worker] Intercepted 'user_created' event from queue. Persistent entity write initiated for: ${email}`);
              await this.userService.createUser(name, email, password);
              console.log(`💾 [Worker] Event transaction successfully resolved and persisted inside PostgreSQL cluster.`);
            } else {
              console.warn('⚠️ [Worker] Execution blocked: UserService container reference is unmapped inside the broker instance.');
            }
          }

          // Broadcast to SSE clients (Sanitizing out the hash from the public real-time stream channel!)
          this.broadcastToSSEClients(parsedPayload.action, parsedPayload.action === 'user_created' 
            ? { name: parsedPayload.data.name, email: parsedPayload.data.email } 
            : parsedPayload.data
          );

          this.channel?.ack(message);

        } catch (error: unknown) {
          console.error('❌ [Worker] Operational failure while processing consumed message:', error);
          this.channel?.nack(message, false, false); // Drop corrupted packets to block poisoning loops
        }
      });

    } catch (error: unknown) {
      console.error('❌ [Worker] Critical error in the asynchronous consumption loop:', error);
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
    console.log(`🔌 [SSE] Client connected to the stream. Total real-time connections: ${this.connectedClients.length}`);

    // 🛡️ MEMORY CLEANUP: Express emits 'close' when the user closes the tab or logs out.
    // Remove the connection from the list to prevent server memory leaks.
    res.on('close', () => {
      this.connectedClients = this.connectedClients.filter(client => client !== res);
      console.log(`❌ [SSE] Connection closed by the browser. Remaining connections: ${this.connectedClients.length}`);
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
        console.error('⚠️ [SSE] Failed to send data to a broken channel:', error);
      }
    });
  }
}
