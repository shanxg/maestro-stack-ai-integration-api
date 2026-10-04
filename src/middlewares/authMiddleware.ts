// 1. IMPORTAÇÕES: Traz os tipos de controle de ciclo do Express e a biblioteca JWT.
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 2. EXTENSÃO DE INTERFACE GLOBAL: Avisa ao TypeScript que o objeto 'Request'
// do Express agora ganha uma propriedade chamada '.user' para guardar os dados decodificados do token.
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// 🔥 RECUPERAÇÃO SEGURA: Captura a chave secreta direto da memória do ambiente (com fallback de segurança caso venha vazia)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_backup_2026';

// 3. O MIDDLEWARE: Atua como um firewall interceptor antes que a requisição bata no seu Controller.
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  
  // Passo A: Captura o cabeçalho 'Authorization' enviado na requisição HTTP
  const authHeader = req.headers.authorization;
  
  // Passo B: Validação primária. Se o cabeçalho não existir, barra com o erro padronizado 401
  if (!authHeader) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token não fornecido'
      }
    });
  }

  // Passo C: Separa a palavra 'Bearer' do hash real do token usando o caractere de espaço
  const parts = authHeader.split(' ');
  const [scheme, token] = parts;

  // 🔥 SALVAGUARDA PARA O MODO ESTRITO: Garante que as variáveis existem de fato antes de usá-las!
  if (!scheme || !token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token inválido ou ausente'
      }
    });
  }

  // Passo D: Validação de estrutura. Confere se existem 2 partes e se o esquema começa com 'Bearer'
  if (parts.length !== 2 || !/^Bearer$/i.test(scheme)) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token mal formatado'
      }
    });
  }

  try {
    // Passo E: Executa a checagem matemática criptográfica da assinatura usando a nossa chave secreta
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Passo F: Sucesso total! Injeta o payload decodificado dentro do objeto req.user
    req.user = payload;
    
    // Passo G: Chama o next() para autorizar a requisição a seguir viagem para o Controller final
    return next();
    
  } catch (error: any) {
    // Passo H: Se o token foi alterado por invasores ou expirou pelo tempo de TTL, barra na hora
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado',
        details: error.message
      }
    });
  }
}
