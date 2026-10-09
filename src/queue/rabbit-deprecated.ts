/**
 * @deprecated OBSOLETO: O arquivo src/queue/rabbit.ts (ou .js) foi descontinuado.
 * Toda a fiação de inicialização do canal, validação de filas (`assertQueue`) 
 * e persistência elástica foi absorvida com comentários didáticos por este novo serviço.
 */


import amqp from 'amqplib';

// 🔥 ATUALIZADO: Lê dinamicamente o HOST injetado pelo Kubernetes, usando localhost como backup local
const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost';
const RABBIT_URL = `amqp://${RABBIT_HOST}:5672`;
export const QUEUE_NAME = 'user_events';

export async function getRabbitChannel(): Promise<amqp.Channel> {
  try {
    // 1. Abre a conexão principal com o servidor do RabbitMQ
    const connection = await amqp.connect(RABBIT_URL);
    
    // 2. Cria um canal de transmissão de dados dentro dessa conexão
    const channel = await connection.createChannel();
    
    // 3. Garante que a fila exista. Se não existir, o RabbitMQ cria na hora.
    // 'durable: true' garante que a fila sobreviva caso o Docker seja reiniciado.
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    return channel;
  } catch (error) {
    console.error('❌ Falha ao conectar no RabbitMQ:', error);
    throw error;
  }
}