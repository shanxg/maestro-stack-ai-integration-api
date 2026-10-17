// 1. FACTORY IMPORT: Brings the modular initializer of the Express ecosystem
// that sets up the RESTful API, as well as connecting Redis and RabbitMQ.
import { createApp } from './app.js';
import { logger } from './logger.js'; // Structured logger without personal data (issue #53)
import { registerShutdownSignals } from './lifecycle.js'; // SIGTERM/SIGINT -> graceful shutdown (issue #51)
import { settings } from './config.js';

// 2. ASYNCHRONOUS ENGINE TRIGGER:
// Executes the assembly function without passing any mock parameter.
// This forces the API to load the real conveyor belt connected to RabbitMQ and Redis for local use!
async function bootstrap() {
  try {
    const server = await createApp();
    // Shut down in order on SIGTERM (Kubernetes, Docker) or SIGINT (Ctrl+C), within the timeout.
    registerShutdownSignals(server, settings.health.shutdownTimeoutMs);
  } catch (error) {
    logger.fatal({ component: 'server', err: error }, 'Failed to start the Maestro API');
    process.exit(1);
  }
}

// Starts the server. 'void' marks the promise as deliberately not awaited (top-level start-up):
// bootstrap() catches every failure itself, logs it and exits with code 1, so it never rejects.
void bootstrap();
