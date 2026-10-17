/**
 * @deprecated Legacy cloud blueprint. This module is NOT wired into the API.
 *
 * The API pushes real-time updates through Server-Sent Events on GET /api/v1/events
 * (EventBrokerService.registerSSEClient). This file keeps the original Socket.IO push
 * channel, the piece that maps to a managed WebSocket service in the cloud design
 * ("Real-Time Push Topology" in README.md). Only src/worker-deprecated.ts uses it.
 *
 * COMPATIBILITY WITH THE CURRENT API:
 * - CORS mirrors the origin allowlist in app.ts instead of the old wildcard ('*').
 * - Every handshake must carry the same JWT that the REST firewall (authMiddleware) verifies.
 * - Broadcasts carry only public user fields, never the password hash.
 */

// 1. IMPORTS: Node HTTP types, the JWT library, and the Socket.io engine.
import type http from 'node:http';
import { verifyAccessToken, type AccessTokenClaims } from '../auth/accessToken.js'; // The same token rules as authMiddleware
import { env } from '../config.js';
import { Server, type Socket } from 'socket.io';
import { type User } from '../models/User.js';
import { logger } from '../logger.js'; // Structured logger without personal data (issue #53)

// 🌐 CORS ALLOWLIST: The same browser origins the REST API accepts (ALLOWED_ORIGINS in src/config.ts).
// A wildcard would let any website open an authenticated socket from a victim's browser.
export const ALLOWED_ORIGINS = [...env.ALLOWED_ORIGINS];

// 🔥 SHARED EXPORT: The global WebSocket instance. It stays undefined until
// initializeSocket() runs, so importing this module has no side effects.
export let io: Server | undefined;

// What the handshake keeps on socket.data, which Socket.io types as 'any' by default: the verified
// token claims, so event handlers can apply per-user rules.
type AuthenticatedSocketData = { user?: AccessTokenClaims };

/**
 * 🔐 HANDSHAKE FIREWALL FACTORY (createHandshakeAuthenticator):
 * Build a Socket.io middleware that runs once per connection attempt, before the
 * 'connection' event, mirroring the JWT check of authMiddleware.
 * Clients send the token with: io(url, { auth: { token } }).
 */
export function createHandshakeAuthenticator() {
  return (socket: Socket, next: (err?: Error) => void): void => {
    // Step A: Read the token from the handshake 'auth' payload.
    // Socket.io types the auth payload as 'any'; it is client input, so it stays 'unknown' until
    // the check below proves it is a string (issue #55, typed lint).
    const token: unknown = (socket.handshake.auth as { token?: unknown } | undefined)?.token;

    // Step B: Reject the connection when the token is missing or blank.
    if (typeof token !== 'string' || token.trim() === '') {
      next(new Error('UNAUTHORIZED: Missing authentication token.'));
      return;
    }

    try {
      // Step C: Verify the signature and expiry, then keep the identity on the socket
      // so event handlers can apply per-user rules later.
      (socket.data as AuthenticatedSocketData).user = verifyAccessToken(token);
      next();
    } catch {
      // Step D: Altered or expired tokens never reach the 'connection' event.
      next(new Error('UNAUTHORIZED: Token signature verification failed or token expired.'));
    }
  };
}

// 2. INITIALIZATION FUNCTION: The worker calls this once to start the engine.
export function initializeSocket(server: http.Server): Server {
  // 🛡️ FAIL CLOSED: src/auth/accessToken.ts loads src/config.ts, which stops the process
  // without a valid JWT_SECRET (CWE-798), so there is no secret check left to do here.

  io = new Server(server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Register the JWT firewall before any connection listener.
  io.use(createHandshakeAuthenticator());

  // Configure the default real-time connection listeners.
  io.on('connection', (socket) => {
    logger.info({ component: 'websocket', socketId: socket.id }, 'Authenticated WebSocket client connected');

    socket.on('disconnect', () => {
      logger.info({ component: 'websocket', socketId: socket.id }, 'WebSocket client disconnected');
    });
  });

  return io;
}

/**
 * 📢 BROADCAST (broadcastUserCreated):
 * Notify every connected client that a user was persisted.
 * Fields are picked explicitly so the bcrypt hash can never leak into the public stream,
 * matching the sanitization done by EventBrokerService before its SSE broadcast.
 */
export function broadcastUserCreated(user: User): void {
  io?.emit('user_created', {
    id: user.id,
    name: user.name,
    email: user.email
  });
}

/**
 * 🛑 GRACEFUL SHUTDOWN (closeSocket):
 * Disconnect all clients and close the underlying HTTP server, then reset the instance.
 */
export async function closeSocket(): Promise<void> {
  const server = io;
  io = undefined;
  await server?.close();
}
