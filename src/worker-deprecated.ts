/**
 * @deprecated Legacy cloud blueprint. This module is NOT wired into the API.
 *
 * The API consumes the 'user_events' queue inside EventBrokerService
 * (startAsynchronousConsumerWorker) and pushes updates through Server-Sent Events.
 * This file keeps the original design: a dedicated worker process (for example an ECS task
 * or a Kubernetes Deployment with several replicas) that consumes the same queue from a
 * managed broker (AWS MQ) and pushes updates through WebSockets.
 * See "Architectural Evolution: Hybrid Cloud Foundations" in README.md.
 *
 * Run it on its own; importing it never starts it:  npx tsx src/worker-deprecated.ts
 *
 * COMPATIBILITY WITH THE CURRENT API:
 * - Message contract: { action: 'user_created', data: { name, email, password } }, the same
 *   envelope that UserController publishes through EventBrokerService.publishEvent().
 *   The first version expected { action: 'create' } and no password, which the API
 *   no longer sends.
 * - 'password' already holds a bcrypt hash computed at the API edge. UserService detects
 *   the hash prefix and stores it without hashing it a second time.
 * - The database schema is created by an awaited initialize() before consuming, the same
 *   anti-race lifecycle that app.ts enforces.
 * - The payload is revalidated with the REST Zod schema, because the queue is a trust
 *   boundary: anything that can publish to it could otherwise inject malformed users.
 * - Logs never include e-mails or hashes; only actions and generated IDs.
 *
 * SCALING NOTE: If the API and this worker run at the same time, both consume
 * 'user_events' as competing consumers and RabbitMQ splits messages between them.
 */

// 🔥 SECURITY REQUIREMENT: Load .env first, as app.ts does, because this process
// starts on its own and needs the database settings and JWT_SECRET.
import 'dotenv/config';

// 1. IMPORTS: Queue tools, persistence and business layers, the shared Zod schema,
// and the WebSocket push channel.
// We put the '.js' suffix because we are using Node's Native Modules (ESM) in the project.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Channel, ConsumeMessage } from 'amqplib';
import { getRabbitChannel, closeRabbitChannel, QUEUE_NAME } from './queue/rabbit-deprecated.js';
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';
import { createUserSchema } from './schemas/userSchema.js';
import { initializeSocket, broadcastUserCreated, closeSocket } from './realtime/socket-deprecated.js';

// 📮 EVENT CONTRACT: Action name published by UserController for new registrations.
export const USER_CREATED_ACTION = 'user_created';

// 🔌 PUSH PORT: The worker serves its own WebSocket endpoint, apart from the API (port 3000).
const SOCKET_PORT = Number(process.env.WORKER_SOCKET_PORT) || 3002;

// Only the method the worker needs; tests can pass a lightweight mock.
type UserCreator = Pick<UserService, 'createUserWithPasswordHash'>;

/**
 * 📥 MESSAGE HANDLER (processUserEventMessage):
 * Decode one queue message, apply the business rule, push the real-time alert,
 * and acknowledge or reject the message. Exported so it can be tested without a broker.
 */
export async function processUserEventMessage(
  channel: Channel,
  message: ConsumeMessage | null,
  userService: UserCreator
): Promise<void> {
  // Security validation: RabbitMQ delivers null when it cancels the consumer
  // (for example, the queue was deleted). There is nothing to process or acknowledge.
  if (message === null) {
    return;
  }

  try {
    // Step A: Convert the Buffer (raw bytes sent over the network) back into a String,
    // and then into a JavaScript object. A malformed JSON throws and is rejected below.
    const content = JSON.parse(message.content.toString());
    console.log(`📥 New message received from the queue! Action: ${content?.action}`);

    // Step B: Internal routing. Only 'user_created' carries a business rule for this worker.
    if (content?.action === USER_CREATED_ACTION) {
      // Step C: Revalidate the payload with the same Zod rules as POST /api/v1/users.
      const parsed = createUserSchema.shape.body.safeParse(content.data);

      if (!parsed.success) {
        // Log only the failing field names, never the values (they may hold personal data).
        const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
        console.warn(`⚠️ Rejected 'user_created' event with invalid fields: ${fields}`);

        // REJECTION (nack with requeue=false): an invalid message would fail on every retry,
        // so it must not go back to the queue (that would create a poison-message loop).
        channel.nack(message, false, false);
        return;
      }

      // Step D (REAL PERSISTENCE): Trigger the business layer to generate the CSPRNG ID and
      // save the user. The password is the bcrypt hash computed by the API controller, so it
      // goes through the trusted path that verifies the hash instead of hashing it again.
      const { name, email, password } = parsed.data;
      const newUser = await userService.createUserWithPasswordHash(name, email, password);
      console.log(`✅ User successfully created in the database via the queue! New ID: ${newUser.id}`);

      // 🔥 (REAL-TIME WEBSOCKET TRIGGER): Push the sanitized user to every authenticated client.
      broadcastUserCreated(newUser);
    } else {
      console.log(`ℹ️ No handler for action "${content?.action}". Acknowledging and skipping.`);
    }

    // CONFIRMATION OF RECEIPT (Acknowledgment / Ack): Notify RabbitMQ that the message was
    // handled, so the broker deletes it from the queue and never delivers it again.
    channel.ack(message);

  } catch (error) {
    console.error('❌ Critical failure while processing the worker message:', error);

    // REJECTION OF MESSAGE (Negative Acknowledgment / Nack):
    // The parameters (false, false) mean "only this message" and "do not requeue".
    // The 'user_events' queue has no dead-letter exchange, so RabbitMQ discards it.
    // In AWS MQ, a dead-letter policy can be added on the broker to keep these messages
    // for analysis without changing the queue arguments shared with the API.
    channel.nack(message, false, false);
  }
}

// HTTP server that hosts the WebSocket endpoint; kept here for the shutdown routine.
let socketServer: http.Server | undefined;

// 2. INITIALIZER FUNCTION OF THE WORKER ENGINE:
// Start the dependencies in a safe order, then listen to the RabbitMQ queue.
export async function startWorker(): Promise<void> {
  console.log('👷 Worker starting. Preparing database, WebSocket, and queue connections...');

  try {
    // Step A: Instantiate the persistence layer and AWAIT the table bootstrap before
    // consuming anything, so no message is processed against a missing table.
    const userRepository = new UserRepository();
    await userRepository.initialize();
    const userService = new UserService(userRepository);

    // Step B: Start the WebSocket push channel on its own HTTP server.
    socketServer = http.createServer();
    initializeSocket(socketServer);
    socketServer.listen(SOCKET_PORT, () => {
      console.log(`📡 Worker WebSocket channel listening on port ${SOCKET_PORT}`);
    });

    // Step C: Open the shared channel. prefetch(1) gives each worker replica one message
    // at a time, so a busy replica does not hoard messages while idle replicas wait.
    const channel = await getRabbitChannel();
    await channel.prefetch(1);

    // Step D: Start consuming. The callback runs for every message the broker delivers.
    await channel.consume(QUEUE_NAME, (message) => processUserEventMessage(channel, message, userService));
    console.log('👷 Worker started successfully! Listening to the event queue...');

  } catch (error) {
    console.error('❌ Critical error while connecting to and initializing the worker engine:', error);
    // Release whatever was opened before the failure, then let the caller decide how to exit.
    await stopWorker();
    throw error;
  }
}

/**
 * 🛑 GRACEFUL SHUTDOWN (stopWorker):
 * Close the broker connection and the WebSocket server (which also closes its HTTP server).
 */
export async function stopWorker(): Promise<void> {
  await closeRabbitChannel();
  await closeSocket();
  socketServer = undefined;
}

// 3. ENTRY POINT: Start only when this file is executed directly
// (npx tsx src/worker-deprecated.ts or node dist/worker-deprecated.js),
// never when another module or a test imports it.
const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  // Container orchestrators send SIGTERM before stopping a task; Ctrl+C sends SIGINT.
  const shutdown = () => {
    console.log('🛑 Shutdown signal received. Closing worker connections...');
    void stopWorker().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // A failed startup exits with code 1 so the orchestrator restarts the task.
  // process.exit() is explicit because the PostgreSQL pool could keep the process alive.
  startWorker().catch(() => process.exit(1));
}
