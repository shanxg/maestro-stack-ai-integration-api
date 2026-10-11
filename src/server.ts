// 1. FACTORY IMPORT: Brings the modular initializer of the Express ecosystem
// that sets up the RESTful API and GraphQL, as well as connecting Redis and RabbitMQ.
import { createApp } from './app.js';

// 2. ASYNCHRONOUS ENGINE TRIGGER:
// Executes the assembly function without passing any mock parameter.
// This forces the API to load the real conveyor belt connected to RabbitMQ and Redis for local use!
async function bootstrap() {
  try {
    await createApp();
  } catch (error) {
    console.error('❌ Critical error while starting the Maestro server:', error);
    process.exit(1);
  }
}

// Starts the server
bootstrap();
