// 🔧 CENTRAL CONFIGURATION (CWE-798 / CWE-1392)
// Every environment variable the API reads is validated here, once, when the process starts.
// A missing or invalid value stops the boot with a clear message instead of a silent
// default. The fixed numbers (rate limits, cache TTL, bcrypt cost) also live here.
import 'dotenv/config';
import { z } from 'zod';

// A TCP port: a whole number between 1 and 65535 (strings from .env are converted).
const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),

  // RFC 7518, section 3.2: HS256 requires a key of at least 256 bits (32 bytes).
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters (RFC 7518, section 3.2)'),

  // PostgreSQL has no default password. The other defaults match docker-compose.yml.
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: port.default(5433),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string().default('postgres'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: port.default(6379),
  RABBIT_HOST: z.string().default('localhost'),
  RABBIT_PORT: port.default(5672),

  // RabbitMQ has no default account: the broker's built-in guest user is never used.
  RABBIT_USER: z.string().refine((user) => user !== 'guest', 'must not be the default guest account'),
  RABBIT_PASSWORD: z.string(),

  // AI chat: the defaults point to a local Ollama server, which ignores the key.
  OPENAI_BASE_URL: z.url().default('http://localhost:11434/v1'),
  OPENAI_API_KEY: z.string().default('local-ollama-free-key-maestro'),
});

// An empty value in .env (for example "PORT=") counts as not set:
// optional variables fall back to their default and required ones are reported as missing.
const definedVariables = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== '')
);

const parsed = envSchema.safeParse(definedVariables);

if (!parsed.success) {
  // List only the variable names and the broken rule, never the values,
  // so a secret cannot end up in the logs.
  const problems = parsed.error.issues
    .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = parsed.data;

// Fixed values that do not change between environments.
export const settings = {
  jwtExpiresIn: '1h',
  bcryptSaltRounds: 12,
  usersCacheTtlSeconds: 60,
  // GET /users page size: the default when no limit is sent, and the largest accepted.
  pagination: { defaultLimit: 10, maxLimit: 100 },
  rateLimits: {
    global: { windowMs: 15 * 60 * 1000, max: 100 }, // per client IP
    login: { windowMs: 5 * 60 * 1000, max: 5 },
    aiChat: { windowMs: 60 * 1000, max: 10 },
  },
} as const;