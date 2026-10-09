/**
 * @deprecated The file src/queue/rabbit.ts (or .js) is obsolete.
 * Channel initialization, queue validation (`assertQueue`),
 * and durable persistence are now handled by the new service.
 */


import amqp from 'amqplib';

// 🔥 Read the host injected by Kubernetes, using localhost as a local fallback.
const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost';
const RABBIT_URL = `amqp://${RABBIT_HOST}:5672`;
export const QUEUE_NAME = 'user_events';

export async function getRabbitChannel(): Promise<amqp.Channel> {
  try {
    // 1. Open the main connection to the RabbitMQ server.
    const connection = await amqp.connect(RABBIT_URL);
    
    // 2. Create a data transmission channel on this connection.
    const channel = await connection.createChannel();
    
    // 3. Ensure the queue exists; RabbitMQ creates it if necessary.
    // 'durable: true' ensures the queue survives a Docker restart.
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    return channel;
  } catch (error) {
    console.error('❌ Falha ao conectar no RabbitMQ:', error);
    throw error;
  }
}