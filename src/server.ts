// 1. FACTORY IMPORT: Brings the modular initializer of the Express ecosystem
// that sets up the RESTful API, as well as connecting Redis and RabbitMQ.
import { createApp } from './app.js';
import { logger } from './logger.js'; // Structured logger without personal data (issue #53)

// 2. ASYNCHRONOUS ENGINE TRIGGER:
// Executes the assembly function without passing any mock parameter.
// This forces the API to load the real conveyor belt connected to RabbitMQ and Redis for local use!
async function bootstrap() {
  try {
    await createApp();
  } catch (error) {
    logger.fatal({ component: 'server', err: error }, 'Failed to start the Maestro API');
    process.exit(1);
  }
}

// Starts the server
bootstrap();
