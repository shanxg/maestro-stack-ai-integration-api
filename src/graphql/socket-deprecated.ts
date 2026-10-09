/**
 * @deprecated The file src/graphql/socket.ts (or .js) is obsolete.
 * It managed the Day 3 Socket.io startup, which has been fully replaced
 * by native Server-Sent Events (SSE) streaming on the /events route.
 */


// 1. IMPORTS: Native HTTP module for types and the Socket.io engine.
import http from 'node:http';
import { Server } from 'socket.io';

// 🔥 SHARED EXPORT: This variable stores the global WebSocket instance.
export let io: Server;

// 2. INITIALIZATION FUNCTION: app.ts calls this once to start the engine.
export function initializeSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Configure the default real-time connection listeners.
  io.on('connection', (socket) => {
    console.log(`🔌 Novo cliente conectado via WebSocket! ID: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado do WebSocket: ${socket.id}`);
    });
  });

  return io;
}
