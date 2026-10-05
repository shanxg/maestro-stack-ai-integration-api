// 1. IMPORTAÇÃO DA FÁBRICA: Traz o inicializador modular do ecossistema Express
import { createApp } from './app.js';

// 2. DISPARO ASSÍNCRONO DO MOTOR:
// Executa a função de montagem sem passar nenhum parâmetro de mock.
// Isso força a API a carregar a esteira real conectada ao RabbitMQ e Redis para uso local!
async function bootstrap() {
  try {
    await createApp();
  } catch (error) {
    console.error('❌ Erro crítico ao tentar dar a partida no servidor Maestro:', error);
    process.exit(1);
  }
}

// Inicializa a execução do servidor
bootstrap();
