// 1. IMPORTAÇÕES: Traz os tipos de controle de ciclo do Express e o tipo de Schema do Zod.
import { type Request, type Response, type NextFunction } from 'express';
import { type ZodObject, ZodError } from 'zod';

// 2. A FUNÇÃO GERADORA DE MIDDLEWARE (HIGHER-ORDER FUNCTION):
// Esta função recebe o schema do Zod como argumento e fabrica um middleware Express sob medida.
export const validateMiddleware = (schema: ZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Passo A: Executa a validação rigorosa dos dados presentes no 'body', 'query' ou 'params'
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Passo B: Sucesso absoluto! Os dados estão limpos e seguros. Avança para o Controller
      next();
    } catch (error) {
      // Passo C: Se o Zod capturar campos inválidos (ex: e-mail sem @), o bloco intercepta o ZodError
      if (error instanceof ZodError) {
        // Passo D: Formata e envelopa as mensagens de erro no padrão unificado da OWASP exigido no cronograma
        res.status(400).json({
          error: {
            code: 'VALIDATION_FAILURE',
            message: 'Falha na validação dos dados de entrada.',
            details: error.issues.map((issue) => ({
              field: issue.path.join('.'), // Mostra o caminho exato do campo (ex: "body.email")
              message: issue.message       // Traz a mensagem customizada que escrevemos no schema
            }))
          }
        });
        return;
      }

      // Passo E: Salvaguarda genérica para quaisquer outras falhas de runtime inesperadas
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro interno ao processar a validação.'
        }
      });
    }
  };
};
