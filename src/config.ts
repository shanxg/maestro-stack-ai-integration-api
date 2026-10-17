// 🔧 CENTRAL CONFIGURATION (CWE-798 / CWE-1392)
// Every environment variable the API reads is validated here, once, when the process starts.
// A missing or invalid value stops the boot with a clear message instead of a silent
// default. The fixed numbers (rate limits, cache TTL, bcrypt cost) also live here.
import 'dotenv/config';
import { z } from 'zod';

// A TCP port: a whole number between 1 and 65535 (strings from .env are converted).
const port = z.coerce.number().int().min(1).max(65535);

// A bare web origin, exactly as browsers send it in the Origin header: http or https, a host and an
// optional port, and nothing else. A path, a trailing slash, a query or a wildcard ("*", or a
// "*.example.com" host) is rejected, because the list must name each trusted origin precisely
// (CWE-942). new URL() normalizes the value, so comparing it with url.origin catches every extra part.
const webOrigin = z.string().refine((value) => {
  if (value.includes('*')) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}, 'each entry must be a bare http(s) origin such as https://app.example.com (no path, trailing slash or wildcard)');

// The origins of the local frontend (Next.js on 3001) and of the API itself (3000), on both host names.
export const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// Exported so tests/config.spec.ts can check the rules without restarting the process.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),

  // Lowest severity written by the logger (src/logger.ts, issue #53): one of pino's levels.
  // 'silent' turns logging off (the test suites use it to keep their output readable).
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

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
  // Redis holds the users cache and the rate-limit counters, so it must require a password
  // (CWE-306). There is no default: docker-compose.yml starts Redis with this same value.
  REDIS_PASSWORD: z.string().min(1),
  RABBIT_HOST: z.string().default('localhost'),
  RABBIT_PORT: port.default(5672),

  // RabbitMQ has no default account: the broker's built-in guest user is never used.
  RABBIT_USER: z.string().refine((user) => user !== 'guest', 'must not be the default guest account'),
  RABBIT_PASSWORD: z.string(),

  // AI chat: the defaults point to a local Ollama server, which ignores the key.
  OPENAI_BASE_URL: z.url().default('http://localhost:11434/v1'),
  OPENAI_API_KEY: z.string().default('local-ollama-free-key-maestro'),
  // Model name sent to the server above (for example "gpt-4o-mini" on the OpenAI platform).
  OPENAI_MODEL: z.string().default('llama3'),

  // Browser origins trusted with credentials (issue #120): the CORS allowlist and the CSRF Origin
  // check (src/middlewares/originCheck.ts) both read this list (CWE-352 / CWE-942). A comma-separated
  // list such as "https://app.example.com,https://admin.example.com"; without it, only the local
  // development origins are trusted, so a deployment that forgets it fails closed.
  ALLOWED_ORIGINS: z
    .string()
    .default(LOCAL_DEVELOPMENT_ORIGINS.join(','))
    .transform((list) => list.split(',').map((origin) => origin.trim()).filter((origin) => origin !== ''))
    .pipe(z.array(webOrigin).min(1, 'must list at least one origin')),
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

// Connection settings shared by every ioredis client (the users cache in UserController and the
// rate-limit counters in app.ts), so no client can be created without the password.
export const redisConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
};

// Fixed values that do not change between environments.
export const settings = {
  // Access tokens (src/auth/accessToken.ts, CWE-347): one algorithm, plus the issuer and audience
  // claims, all checked on every request. The API issues its tokens for itself, so both name it.
  jwt: {
    algorithm: 'HS256',
    issuer: 'maestro-api',
    audience: 'maestro-api',
    expiresIn: '1h',
  },
  // Browser session (src/auth/sessionCookie.ts, CWE-922): the login stores the JWT in an HttpOnly
  // cookie that page scripts cannot read. It lives as long as the token itself (settings.jwt.expiresIn).
  sessionCookie: {
    name: 'maestro_session',
    maxAgeSeconds: 60 * 60,
  },
  bcryptSaltRounds: 12,
  usersCacheTtlSeconds: 60,
  // Probes and shutdown (issue #51). The readiness result is reused for readinessCacheMs, so the
  // public, unthrottled readiness endpoint runs its database query at most once per interval.
  // shutdownTimeoutMs stays below Kubernetes' default 30 s grace period before SIGKILL.
  health: {
    readinessCacheMs: 2_000,
    shutdownTimeoutMs: 10_000,
  },
  // PostgreSQL connection pool (src/repositories/UserRepository.ts, issue #93). Without a
  // connection timeout, a request waits for the operating system's TCP timeout (minutes) when
  // the database host does not answer; with it, the request fails fast with a 503.
  database: {
    poolMax: 10,                // connections kept by each API replica
    idleTimeoutMs: 30_000,      // an idle connection is closed after this time
    connectionTimeoutMs: 5_000, // longest wait for a new connection before the query fails
  },
  // GET /api/v1/users page size: the default when no limit is sent, and the largest accepted.
  pagination: { defaultLimit: 10, maxLimit: 100 },
  rateLimits: {
    global: { windowMs: 15 * 60 * 1000, max: 100 }, // per client IP
    login: { windowMs: 5 * 60 * 1000, max: 5 },
    aiChat: { windowMs: 60 * 1000, max: 10 }, // per account (the user id in the JWT)
  },
  // POST /api/v1/ai/chat bounds (CWE-770 / OWASP LLM10:2025): every prompt costs model compute,
  // so the input, the output and the waiting time all have a ceiling.
  aiChat: {
    maxPromptLength: 2000, // characters accepted in the prompt field
    maxTokens: 512,        // longest answer the model may generate (max_tokens)
    timeoutMs: 60_000,     // a local model on CPU is slow; past this the API answers 503
  },
} as const;