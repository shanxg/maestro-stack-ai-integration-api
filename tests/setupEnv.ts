// 🔐 TEST ENVIRONMENT (runs before every test file, see setupFiles in jest.config.ts)
// src/config.ts validates the environment on import and stops without JWT_SECRET,
// POSTGRES_PASSWORD, the RabbitMQ account and REDIS_PASSWORD. These values exist only for this test run, so
// the suites work on a fresh clone or in CI. They are set before any .env is loaded, and dotenv
// never overwrites a variable that is already set, so local secrets stay out of the tests.
import crypto from 'node:crypto';

process.env.JWT_SECRET ??= crypto.randomBytes(32).toString('hex');
process.env.POSTGRES_PASSWORD ??= crypto.randomBytes(16).toString('hex');
process.env.RABBIT_USER ??= 'maestro-test';
process.env.RABBIT_PASSWORD ??= crypto.randomBytes(16).toString('hex');
process.env.REDIS_PASSWORD ??= crypto.randomBytes(16).toString('hex');