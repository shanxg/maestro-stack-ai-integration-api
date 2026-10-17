import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { Request, Response } from 'express';
import { UserService } from './UserService.js'; // Ensure the user service is imported at the top layer
import { env } from '../config.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)

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
    // Host, port and account come from src/config.ts. The logged address never carries the credentials.
    const rabbitAddress = `amqp://${env.RABBIT_HOST}:${env.RABBIT_PORT}`;

    logger.info({ component: 'rabbitmq', address: rabbitAddress }, 'Connecting to RabbitMQ');

    try {
      // Open the main connection with the configured account (never the broker's default guest user).
      // The options object avoids building a URL with the password in it.
      this.connection = await amqp.connect({
        protocol: 'amqp',
        hostname: env.RABBIT_HOST,
        port: env.RABBIT_PORT,
        username: env.RABBIT_USER,
        password: env.RABBIT_PASSWORD,
      });
      this.channel = await this.connection.createChannel();

      // 🛡️ RESILIENCE: Ensure the queue exists before sending any data.
      await this.channel.assertQueue(this.queueName, { durable: true });
      logger.info({ component: 'rabbitmq', queue: this.queueName }, 'Queue ready');

      // Start the background consumer once the network connection is ready.
      this.startAsynchronousConsumerWorker();

    } catch (error: unknown) {
      // Only the reason is logged: the error never holds the password (the connection uses an options object).
      logger.warn({ component: 'rabbitmq', reason: error instanceof Error ? error.message : String(error) }, 'Connection attempt failed; retrying in 5 seconds');
      
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
        logger.warn({ component: 'rabbitmq' }, 'Publish rejected: the messaging channel is offline');
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
      
      logger.info({ component: 'rabbitmq', action }, 'Event published to the queue');
      return isPublished;

    } catch (error: unknown) {
      logger.error({ component: 'rabbitmq', err: error }, 'Failed to publish the event');
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

      logger.info({ component: 'consumer', queue: this.queueName }, 'Consumer started');

      await this.channel.consume(this.queueName, async (message) => {
        if (!message) return;

        try {
          const rawContent = message.content.toString();
          const parsedPayload = JSON.parse(rawContent);

          logger.debug({ component: 'consumer' }, 'Event received from the queue');

          // =========================================================================
          // ⚙️ ASYNCHRONOUS SERVICE LAYER PERSISTENCE INGESTION
          // =========================================================================
          // Extrapolate the safe cryptographically protected credentials block sent from the controller boundary
          if (parsedPayload.action === 'user_created') {
            const { name, email, password } = parsedPayload.data;
            
            // APPSEC REMEDIATION - EVENT CONSUMPTION INGESTION ACTIVATION
            // The message carries the bcrypt hash computed by UserController, so it goes through the
            // trusted path that stores a verified hash as is (createUser would hash it a second time).
            if (this.userService) {
              // NO PERSONAL DATA IN LOGS (CWE-532, issue #53): this line used to print the new account's e-mail.
              logger.info({ component: 'consumer', action: 'user_created' }, 'Creating the account from a queued registration');
              const createdUser = await this.userService.createUserWithPasswordHash(name, email, password);
              logger.info({ component: 'consumer', userId: createdUser.id }, 'Account created');

              // MINIMUM DATA ON THE STREAM (issue #35): every signed-in account receives these events,
              // but a regular account may only read its own record (AUTHZ-01). So the event carries
              // only the new account's id, never its name, e-mail or password hash; a client that may
              // see the record fetches it through GET /users/{id}, where the access rules apply.
              this.broadcastToSSEClients('user_created', { id: createdUser.id });
            } else {
              logger.warn({ component: 'consumer' }, 'UserService is not wired; the event was not processed');
            }
          }
          // Other actions are not forwarded to the stream: only known events, with known fields, go out.

          this.channel?.ack(message);

        } catch (error: unknown) {
          logger.error({ component: 'consumer', err: error }, 'Failed to process the message; it was discarded');
          this.channel?.nack(message, false, false); // Drop corrupted packets to block poisoning loops
        }
      });

    } catch (error: unknown) {
      logger.error({ component: 'consumer', err: error }, 'The consumer loop failed');
    }
  }

  /**
  * 📡 4. STREAM REGISTRATION (registerSSEClient):
  * Handle the /events HTTP route, set Server-Sent Events headers,
  * and keep the response open as an active stream.
   */
  // The parameter types come from Express (issue #47). Before, 'Request | any' named the browser's
  // fetch Request, not Express's, and the '| any' turned off type checking for the argument.
  // The request is not read yet; it stays in the signature because the route passes both.
  registerSSEClient(_req: Request, res: Response): void {
    // Required W3C headers for continuous one-way text streaming.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // No 'Access-Control-Allow-Origin: *' here any more (CWE-942): the global cors middleware in
    // app.ts already answers with the requesting origin only when it is on ALLOWED_ORIGINS,
    // together with Allow-Credentials, which the cookie-authenticated stream needs.

    // Send an initial heartbeat to establish the connection with the frontend.
    res.write('data: {"status": "CONNECTED_TO_MAESTRO_STREAM"}\n\n');

    // Add this active connection to the global broadcast list.
    this.connectedClients.push(res);
    logger.info({ component: 'sse', connections: this.connectedClients.length }, 'Stream client connected');

    // 🛡️ MEMORY CLEANUP: Express emits 'close' when the user closes the tab or logs out.
    // Remove the connection from the list to prevent server memory leaks.
    res.on('close', () => {
      this.connectedClients = this.connectedClients.filter(client => client !== res);
      logger.info({ component: 'sse', connections: this.connectedClients.length }, 'Stream client disconnected');
    });
  }

  /**
  * 📢 5. BROADCAST (broadcastToSSEClients):
  * Send event data to every open response using the SSE syntax.
   */
  // 'object' instead of 'any' (issue #47): any JSON object is accepted, but a value that is not
  // an object (or a typo such as passing the event name twice) is a compile error.
  private broadcastToSSEClients(event: string, data: object): void {
    // SSE requires this syntax to trigger the browser's event listener: "event: name\ndata: {json}\n\n".
    const formattedData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Send the formatted text to every active network connection.
    this.connectedClients.forEach(client => {
      try {
        client.write(formattedData);
      } catch (error: unknown) {
        logger.warn({ component: 'sse', err: error }, 'Failed to write to a stream client');
      }
    });
  }
}
