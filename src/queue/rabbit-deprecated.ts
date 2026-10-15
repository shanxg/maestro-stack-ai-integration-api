/**
 * @deprecated Legacy cloud blueprint. This module is NOT wired into the API.
 *
 * The running API publishes to and consumes from the 'user_events' queue through
 * src/services/EventBrokerService.ts. This file keeps the original standalone channel
 * factory, designed for a managed broker (AWS MQ for RabbitMQ), so that the dedicated
 * worker process in src/worker-deprecated.ts can scale on its own hosts.
 * See "Architectural Evolution: Hybrid Cloud Foundations" in README.md.
 *
 * COMPATIBILITY WITH THE CURRENT API:
 * - Same queue name and same queue arguments ({ durable: true }) as EventBrokerService.
 *   RabbitMQ refuses a second declaration of an existing queue with different arguments
 *   (channel error 406 PRECONDITION_FAILED), so both sides must declare it identically.
 * - One shared connection and channel per process. The first version opened a brand-new
 *   TCP connection on every call and never closed it, leaking sockets under load.
 */

import amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';

// 🔥 BROKER ADDRESS: Read the host injected by Kubernetes (or the AWS MQ endpoint),
// using localhost as a local fallback. EventBrokerService resolves the same variable.
const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost';
const RABBIT_URL = `amqp://${RABBIT_HOST}:5672`;

// 📮 SHARED QUEUE CONTRACT: Must match the queue name used by EventBrokerService,
// otherwise the API would publish to one queue while this worker listens to another.
export const QUEUE_NAME = 'user_events';

// 🔌 PROCESS-WIDE SINGLETONS:
// 'connection' is the TCP link to the broker; 'channelPromise' is the pending or ready
// logical channel. Storing the promise (not only the channel) ensures that concurrent
// callers arriving before the first handshake finishes share that same handshake.
let connection: ChannelModel | undefined;
let channelPromise: Promise<Channel> | undefined;

/**
 * 📡 CHANNEL FACTORY (getRabbitChannel):
 * Return the shared channel, opening the connection and declaring the queue on first use.
 */
export async function getRabbitChannel(): Promise<Channel> {
  // Step A: Reuse the existing (or in-flight) channel instead of opening a new connection.
  channelPromise ??= openRabbitChannel();
  return channelPromise;
}

/**
 * 🔧 CONNECTION BOOTSTRAP (openRabbitChannel):
 * Perform the actual handshake. Kept private so every caller goes through the singleton.
 */
async function openRabbitChannel(): Promise<Channel> {
  try {
    // 1. Open the main connection to the RabbitMQ server.
    connection = await amqp.connect(RABBIT_URL);

    // 2. Create a data transmission channel on this connection.
    const channel = await connection.createChannel();

    // 3. Ensure the queue exists; RabbitMQ creates it if necessary.
    // 'durable: true' ensures the queue survives a broker restart, and it must stay
    // identical to the declaration in EventBrokerService (see the header comment).
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    return channel;
  } catch (error) {
    console.error('❌ Failed to connect to RabbitMQ:', error);

    // 🧹 CLEAN FAILURE STATE: Forget the failed attempt and release any half-open
    // connection, so the next call retries from scratch instead of reusing a broken link.
    await closeRabbitChannel();
    throw error;
  }
}

/**
 * 🛑 GRACEFUL SHUTDOWN (closeRabbitChannel):
 * Close the shared connection (which also closes its channels) and reset the singletons.
 * Called when the worker receives SIGTERM, as container orchestrators (ECS, Kubernetes)
 * send that signal before stopping a task.
 */
export async function closeRabbitChannel(): Promise<void> {
  const openConnection = connection;

  // Reset first, so new callers open a fresh connection even if closing fails below.
  connection = undefined;
  channelPromise = undefined;

  try {
    await openConnection?.close();
  } catch (error) {
    console.error('⚠️ Failed to close the RabbitMQ connection cleanly:', error);
  }
}
