import amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import type { Request, Response } from 'express';
import { UserService } from './UserService.js'; // Ensure the user service is imported at the top layer
import { env } from '../config.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)
import { type UsersCache } from '../cache/usersCache.js'; // Invalidated once a new account is saved (issue #52)
import { QUEUE_NAME, assertUserEventsTopology } from '../queue/topology.js'; // Queue + dead-letter queue (issue #50)
import { queueEnvelopeSchema, userCreatedEventSchema } from '../schemas/eventSchema.js'; // Queue messages are validated (issue #50)
import { DuplicateEmailError } from '../errors/DuplicateEmailError.js';

export class EventBrokerService {
  // Both are 'undefined' while disconnected and again after close() (issue #51).
  private connection: ChannelModel | undefined;
  private channel: Channel | undefined;

  // 👥 ACTIVE CONNECTIONS (SSE TUNNEL):
  // Temporarily store Express Response objects for all connected clients.
  private connectedClients: Response[] = [];

  // Unique queue name registered with the RabbitMQ server.
  // Declared, with its dead-letter queue, in src/queue/topology.ts (issue #50).
  private readonly queueName = QUEUE_NAME;

  // GRACEFUL SHUTDOWN STATE (issue #51): once close() runs, no reconnection is scheduled, and a
  // pending reconnection timer is cancelled, so the process can exit.
  private closing = false;
  private reconnectTimer?: NodeJS.Timeout;

  // usersCache is optional like userService: the API passes both; a broker built only to publish
  // (or by a test) runs without them.
  constructor(
    private userService?: UserService,
    private usersCache?: UsersCache
  ) {
    if (userService) {
      this.userService = userService;
    }
    // Automatically establish connections to the Docker infrastructure. A constructor cannot await;
    // 'void' marks the call as deliberately not awaited. The method catches every failure itself
    // and schedules a retry, so the promise never rejects.
    void this.establishInfrastructureBridges();
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
        password: env.RABBIT_PASSWORD
      });
      this.channel = await this.connection.createChannel();

      // 🛡️ RESILIENCE: Ensure the queue, its dead-letter exchange and the dead-letter queue exist
      // before sending any data (src/queue/topology.ts, issue #50).
      await assertUserEventsTopology(this.channel);
      logger.info({ component: 'rabbitmq', queue: this.queueName }, 'Queue ready');

      // Start the background consumer once the network connection is ready. A broker built
      // without a UserService only publishes: consuming would take messages it cannot process.
      if (this.userService) {
        // Not awaited on purpose: the consumer runs in the background. It catches and logs its own
        // failures, so the promise never rejects ('void' says so to the linter, issue #55).
        void this.startAsynchronousConsumerWorker();
      }
    } catch (error: unknown) {
      // Only the reason is logged: the error never holds the password (the connection uses an options object).
      logger.warn(
        { component: 'rabbitmq', reason: error instanceof Error ? error.message : String(error) },
        'Connection attempt failed; retrying in 5 seconds'
      );

      // Schedule a recurring micro-task loop to recover the connection channel automatically,
      // unless the API is shutting down (issue #51). The handle is kept so close() can cancel it.
      if (!this.closing) {
        this.reconnectTimer = setTimeout(() => {
          void this.establishInfrastructureBridges(); // Never rejects: a failure schedules the next retry
        }, 5000);
      }
    }
  }

  /**
   * 🩺 READINESS (issue #51): true while the channel to RabbitMQ is open. Without it, registrations
   * answer 503 and no queued account is created, so the replica reports itself not ready.
   */
  isConnected(): boolean {
    return this.channel !== undefined && !this.closing;
  }

  /**
   * 🛑 GRACEFUL SHUTDOWN (close, issue #51):
   * 1. Stop reconnecting.
   * 2. End every open Server-Sent Events stream. An open stream keeps its HTTP connection alive,
   *    so server.close() would otherwise wait for it until the orchestrator's SIGKILL; browsers
   *    reconnect on their own to another replica.
   * 3. Close the channel and the connection. A message being processed is not acknowledged, so
   *    RabbitMQ delivers it again to another consumer instead of losing it.
   */
  async close(): Promise<void> {
    this.closing = true;
    clearTimeout(this.reconnectTimer);

    for (const client of this.connectedClients) {
      client.end();
    }
    this.connectedClients = [];

    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (error: unknown) {
      logger.warn(
        { component: 'rabbitmq', reason: error instanceof Error ? error.message : String(error) },
        'Failed to close the RabbitMQ connection cleanly'
      );
    } finally {
      this.channel = undefined;
      this.connection = undefined;
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
   * Continuously listen to the queue in the background and hand every message to handleMessage().
   */
  private async startAsynchronousConsumerWorker(): Promise<void> {
    try {
      if (!this.channel) {
        setTimeout(() => void this.startAsynchronousConsumerWorker(), 1000);
        return;
      }

      logger.info({ component: 'consumer', queue: this.queueName }, 'Consumer started');
      // The callback returns handleMessage()'s promise on purpose. amqplib ignores the return value
      // (handleMessage() settles every message itself: ack, or nack to the dead-letter queue), while
      // tests/eventBroker.spec.ts awaits it to know when a delivered message has been handled.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      await this.channel.consume(this.queueName, (message) => this.handleMessage(message));
    } catch (error: unknown) {
      logger.error({ component: 'consumer', err: error }, 'The consumer loop failed');
    }
  }

  /**
   * 📥 MESSAGE HANDLING (issue #50): every message ends in exactly one of three outcomes.
   * - ACK: processed, or deliberately ignored (an unknown action, or a registration for an e-mail
   *   that already has an account). Nothing to retry.
   * - NACK WITHOUT REQUEUE -> DEAD-LETTER QUEUE: the message is malformed, or saving failed (for
   *   example, the database was down). Before, RabbitMQ deleted these, so a registration could
   *   vanish after the client got 202; now they wait in 'user_events.dead' for an operator.
   *   Requeueing instead would redeliver a broken message forever (a poison-message loop).
   * Log lines name the outcome and, at most, the account id: never the e-mail or name (CWE-532).
   */
  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    // RabbitMQ delivers null when it cancels the consumer (for example, the queue was deleted).
    if (!message) return;

    // Step A: Decode. A body that is not JSON can never be processed.
    let payload: unknown;
    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      this.deadLetter(message, 'The message is not valid JSON');
      return;
    }

    // Step B: Route by action. Only 'user_created' has a handler; other actions are acknowledged
    // and not forwarded to the stream (only known events, with known fields, go out).
    const envelope = queueEnvelopeSchema.safeParse(payload);
    if (!envelope.success || envelope.data.action !== 'user_created') {
      logger.info(
        { component: 'consumer', action: envelope.success ? envelope.data.action : undefined },
        'No handler for this action; acknowledged'
      );
      this.channel?.ack(message);
      return;
    }

    // Step C: Validate the registration (the queue is a trust boundary). Only the failing field
    // names are logged, never the values.
    const event = userCreatedEventSchema.safeParse(payload);
    if (!event.success) {
      const fields = event.error.issues.map((issue) => issue.path.join('.')).join(', ');
      this.deadLetter(message, 'The registration message failed validation', { fields });
      return;
    }

    // Step D: Save the account through the trusted path that stores a verified hash as it is
    // (createUser would hash it a second time).
    const { name, email, password } = event.data.data;
    try {
      // NO PERSONAL DATA IN LOGS (CWE-532, issue #53): this line used to print the new account's e-mail.
      logger.info({ component: 'consumer', action: 'user_created' }, 'Creating the account from a queued registration');
      const createdUser = await this.userService!.createUserWithPasswordHash(name, email, password);
      logger.info({ component: 'consumer', userId: createdUser.id }, 'Account created');

      // CACHE INVALIDATION AT THE RIGHT TIME (issue #52): the account exists only from this
      // point on, so cached GET /api/v1/users pages become stale now, not when the API answered 202.
      // One INCR of the cache version (src/cache/usersCache.ts) replaces the blocking
      // redis.keys('users:*') scan; a Redis failure here only logs a warning.
      await this.usersCache?.invalidate();

      // MINIMUM DATA ON THE STREAM (issue #35): every signed-in account receives these events,
      // but a regular account may only read its own record (AUTHZ-01). So the event carries
      // only the new account's id, never its name, e-mail or password hash; a client that may
      // see the record fetches it through GET /api/v1/users/{id}, where the access rules apply.
      this.broadcastToSSEClients('user_created', { id: createdUser.id });
      this.channel?.ack(message);
    } catch (error: unknown) {
      // DUPLICATE E-MAIL (issue #50): an expected outcome, not a failure. The API answered the same
      // 202 it answers for a new e-mail, so the registration route does not reveal which e-mails
      // have accounts (CWE-204); the existing account is left untouched and nothing is retried.
      if (error instanceof DuplicateEmailError) {
        logger.info(
          { component: 'consumer', action: 'user_created' },
          'Registration ignored: the e-mail already has an account'
        );
        this.channel?.ack(message);
        return;
      }
      this.deadLetter(message, 'Failed to save the queued registration', { err: error });
    }
  }

  // Reject a message without requeueing it: the queue's dead-letter exchange moves it to
  // 'user_events.dead' (src/queue/topology.ts), where it is kept for inspection.
  private deadLetter(message: ConsumeMessage, reason: string, details: Record<string, unknown> = {}): void {
    logger.error({ component: 'consumer', ...details }, `${reason}; moved to the dead-letter queue`);
    this.channel?.nack(message, false, false);
  }

  /**
   * 📡 4. STREAM REGISTRATION (registerSSEClient):
   * Handle the /api/v1/events HTTP route, set Server-Sent Events headers,
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
      this.connectedClients = this.connectedClients.filter((client) => client !== res);
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
    this.connectedClients.forEach((client) => {
      try {
        client.write(formattedData);
      } catch (error: unknown) {
        logger.warn({ component: 'sse', err: error }, 'Failed to write to a stream client');
      }
    });
  }
}
