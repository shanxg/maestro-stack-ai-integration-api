/**
 * @deprecated Legacy cloud blueprint. This module is NOT wired into the API.
 *
 * The API pushes real-time updates through Server-Sent Events on GET /events
 * (EventBrokerService.registerSSEClient). This file keeps the original Socket.IO push
 * channel, the piece that maps to a managed WebSocket service in the cloud design
 * ("Real-Time Push Topology" in README.md). Only src/worker-deprecated.ts uses it.
 *
 * COMPATIBILITY WITH THE CURRENT API:
 * - CORS mirrors the origin allowlist in app.ts instead of the old wildcard ('*').
 * - Every handshake must carry the same JWT that the REST and GraphQL firewalls verify.
 * - Broadcasts carry only public user fields, never the password hash.
 */

// 1. IMPORTS: Node HTTP types, the JWT library, and the Socket.io engine.
import type http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { type User } from '../models/User.js';

// 🌐 CORS ALLOWLIST: Same browser origins that app.ts accepts for the REST API.
// A wildcard would let any website open an authenticated socket from a victim's browser.
export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

// 🔥 SHARED EXPORT: The global WebSocket instance. It stays undefined until
// initializeSocket() runs, so importing this module has no side effects.
export let io: Server | undefined;

/**
 * 🔐 HANDSHAKE FIREWALL FACTORY (createHandshakeAuthenticator):
 * Build a Socket.io middleware that runs once per connection attempt, before the
 * 'connection' event, mirroring the JWT check of authMiddleware and the GraphQL context.
 * Clients send the token with: io(url, { auth: { token } }).
 */
export function createHandshakeAuthenticator(secret: string) {
  return (socket: Socket, next: (err?: Error) => void): void => {
    // Step A: Read the token from the handshake 'auth' payload.
    const token = socket.handshake.auth?.token;

    // Step B: Reject the connection when the token is missing or blank.
    if (typeof token !== 'string' || token.trim() === '') {
      next(new Error('UNAUTHORIZED: Missing authentication token.'));
      return;
    }

    try {
      // Step C: Verify the signature and expiry, then keep the identity on the socket
      // so event handlers can apply per-user rules later.
      socket.data.user = jwt.verify(token, secret);
      next();
    } catch {
      // Step D: Altered or expired tokens never reach the 'connection' event.
      next(new Error('UNAUTHORIZED: Token signature verification failed or token expired.'));
    }
  };
}

// 2. INITIALIZATION FUNCTION: The worker calls this once to start the engine.
export function initializeSocket(server: http.Server): Server {
  // 🛡️ FAIL CLOSED: Refuse to start without the signing secret, as app.ts does (CWE-798).
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }

  io = new Server(server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Register the JWT firewall before any connection listener.
  io.use(createHandshakeAuthenticator(secret));

  // Configure the default real-time connection listeners.
  io.on('connection', (socket) => {
    console.log(`🔌 New authenticated client connected via WebSocket! ID: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected from WebSocket: ${socket.id}`);
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
