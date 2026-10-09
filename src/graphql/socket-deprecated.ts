/**
 * @deprecated OBSOLETO: O arquivo src/graphql/socket.ts (ou .js) foi descontinuado.
 * Ele gerenciava a inicialização do Socket.io do Dia 3, que foi 100% substituído 
 * pelo túnel leve de streaming nativo do protocolo Server-Sent Events (SSE) na rota /events.
 */


// 1. IMPORTAÇÕES: Módulo nativo HTTP para os tipos e o motor do Socket.io
import http from 'node:http';
import { Server } from 'socket.io';

// 🔥 EXPORTAÇÃO COMPARTILHADA: Essa variável guardará a instância global do WebSocket
export let io: Server;

// 2. FUNÇÃO DE ENGENHARIA: Ela será chamada uma única vez pelo app.ts para dar a partida no motor
export function initializeSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Configura os ouvintes padrão de conexão em tempo real
  io.on('connection', (socket) => {
    console.log(`🔌 Novo cliente conectado via WebSocket! ID: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado do WebSocket: ${socket.id}`);
    });
  });

  return io;
}
