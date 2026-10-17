// 1. IMPORTS: express-rate-limit, the Redis-backed counter store and the fixed limits.
import { type Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { type Redis } from 'ioredis';
import { RedisRateLimitStore } from './redisRateLimitStore.js';
import { settings } from '../config.js';

/**
 * 🚦 RATE LIMITERS (CWE-770 / CWE-307 / OWASP LLM10:2025):
 * The three limiters of the API, moved out of src/app.ts (issue #46) so the composition root only
 * wires them. Windows and caps live in src/config.ts (settings.rateLimits).
 *
 * SHARED COUNTERS: Kubernetes runs two API replicas, so every limiter keeps its counters in Redis
 * (src/middlewares/redisRateLimitStore.ts), each under its own key prefix. The client passed in must
 * have no offline queue: while Redis is down, commands fail at once and the stores switch to
 * per-process memory counters instead of holding requests until Redis returns.
 */
export function createRateLimiters(redis: Redis) {
  // GLOBAL LIMIT: every route, per client IP, against request floods.
  const global = rateLimit({
    windowMs: settings.rateLimits.global.windowMs,
    max: settings.rateLimits.global.max,
    store: new RedisRateLimitStore(redis, 'rl:global:'), // Shared by every replica
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Você atingiu o limite máximo de requisições toleradas. Aguarde 15 minutos.'
      }
    }
  });

  // LOGIN LIMIT (CWE-307): a much smaller budget per IP on the login route only, against password
  // guessing and credential stuffing.
  const login = rateLimit({
    windowMs: settings.rateLimits.login.windowMs,
    max: settings.rateLimits.login.max,
    store: new RedisRateLimitStore(redis, 'rl:login:'), // Shared by every replica
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: {
        code: 'AUTH_FLOOD_DETECTED',
        message: 'Too many authentication attempts from this endpoint link. Access locked for 5 minutes.'
      }
    }
  });

  // AI CHAT LIMIT (OWASP LLM10:2025): every prompt costs model compute.
  const aiChat = rateLimit({
    windowMs: settings.rateLimits.aiChat.windowMs,
    max: settings.rateLimits.aiChat.max,
    // PER-ACCOUNT LIMIT: the AI route runs after authMiddleware, which stores the verified JWT payload
    // in req.user, so the counter follows the account instead of the IP address. Users behind one
    // shared IP (an office or a mobile carrier) do not block each other, and one account cannot
    // multiply its budget by switching networks. The IP is only a fallback for a token without an
    // id claim; ipKeyGenerator groups IPv6 addresses by subnet, as express-rate-limit recommends.
    keyGenerator: (req: Request) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
    store: new RedisRateLimitStore(redis, 'rl:ai-chat:'), // Shared by every replica
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: {
        code: 'LLM_COMPUTE_LIMIT_EXCEEDED',
        message: 'Prompt generation burst threshold triggered. Please wait a moment before sending new tokens.'
      }
    }
  });

  return { global, login, aiChat };
}
