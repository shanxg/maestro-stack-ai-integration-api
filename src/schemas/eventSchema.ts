// Import the structural validation engine from Zod and the REST registration rules.
import { z } from 'zod';
import { createUserSchema } from './userSchema.js';

// A complete bcrypt hash: version, two-digit cost, then 53 characters of salt and digest.
// Shared with UserService.createUserWithPasswordHash, which also checks the cost.
export const BCRYPT_HASH_FORMAT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// The envelope every queue message has: only the action is read before choosing a schema.
export const queueEnvelopeSchema = z.object({
  action: z.string(),
});

/**
 * 📨 QUEUE MESSAGE SCHEMA (issue #50): 'user_created', as UserController publishes it.
 * The queue is a trust boundary: anything that can publish to it could otherwise inject a
 * malformed account. Before, the consumer destructured JSON.parse() output (typed 'any') and
 * passed whatever it found to the service. The name and e-mail follow the same rules as
 * POST /api/v1/users; the password must already be a bcrypt hash (the API hashes it before
 * publishing, so plaintext never travels through RabbitMQ).
 */
export const userCreatedEventSchema = z.object({
  action: z.literal('user_created'),
  data: z.object({
    name: createUserSchema.shape.body.shape.name,
    email: createUserSchema.shape.body.shape.email,
    password: z.string().regex(BCRYPT_HASH_FORMAT, { message: 'A senha na fila deve ser um hash bcrypt completo.' }),
  }),
});
