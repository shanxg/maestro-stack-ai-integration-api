// 1. IMPORTS: The amqplib channel type.
import type { Channel } from 'amqplib';

/**
 * 📮 QUEUE TOPOLOGY (issue #50): the one place that declares the registration queue, shared by
 * EventBrokerService (the API) and the legacy worker blueprint (rabbit-deprecated.ts). RabbitMQ
 * refuses to redeclare a queue with different arguments, so every process must declare it the
 * same way; keeping the declaration here makes that automatic.
 *
 * DEAD-LETTER QUEUE: before, a message that could not be processed was rejected with
 * nack(requeue=false) and RabbitMQ deleted it, so a failed registration vanished without a
 * trace. Now the main queue names a dead-letter exchange: a rejected message is moved to
 * 'user_events.dead', where it stays (durable) until an operator inspects it and, if it should
 * be retried, moves it back (for example with the management UI's "Move messages").
 *
 *   publisher ──▶ user_events ──(nack, requeue=false)──▶ user_events.dlx ──▶ user_events.dead
 *
 * MIGRATION: a broker that already has 'user_events' without these arguments answers
 * PRECONDITION_FAILED (inequivalent arg 'x-dead-letter-exchange'). Delete the old queue once,
 * after checking it is empty (rabbitmqctl list_queues name messages), and restart the API.
 */
export const QUEUE_NAME = 'user_events';
export const DEAD_LETTER_EXCHANGE = 'user_events.dlx';
export const DEAD_LETTER_QUEUE = 'user_events.dead';

export async function assertUserEventsTopology(channel: Channel): Promise<void> {
  // The exchange that receives rejected messages. 'fanout' ignores routing keys: every message
  // dead-lettered from user_events goes to the single dead-letter queue bound below.
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });

  // Where rejected messages wait for an operator. Durable, so they survive a broker restart.
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '');

  // The main queue: durable (survives a broker restart) and pointing at the dead-letter exchange.
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE }
  });
}
