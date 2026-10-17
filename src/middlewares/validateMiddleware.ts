// 1. IMPORTS: Bring in Express lifecycle types and the Zod schema type.
import { type Request, type Response, type NextFunction } from 'express';
import { type ZodObject, ZodError } from 'zod';

// 2. MIDDLEWARE FACTORY (HIGHER-ORDER FUNCTION):
// Accept a Zod schema and create a tailored Express middleware.
export const validateMiddleware = (schema: ZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Step A: Strictly validate data in 'body', 'query', or 'params'.
      await schema.parseAsync({
        // Express types the parsed body as 'any'; 'unknown' says what it is (untrusted input) until
        // the schema has checked it (issue #55, typed lint).
        body: req.body as unknown,
        query: req.query,
        params: req.params
      });

      // Step B: The data is valid; continue to the controller.
      next();
    } catch (error) {
      // Step C: Handle Zod errors for invalid fields (for example, an email without @).
      if (error instanceof ZodError) {
        // Step D: Format errors using the unified OWASP response shape.
        res.status(400).json({
          error: {
            code: 'VALIDATION_FAILURE',
            message: 'Falha na validação dos dados de entrada.',
            details: error.issues.map((issue) => ({
              field: issue.path.join('.'), // Show the exact field path (for example, "body.email")
              message: issue.message // Include the custom message defined in the schema
            }))
          }
        });
        return;
      }

      // Step E: Any other error is unexpected (for example, a bug inside a schema refinement).
      // Hand it to the central errorHandler (src/middlewares/errorHandler.ts), which logs it
      // and answers the same generic 500 as every other route, without internal details (CWE-209).
      next(error);
    }
  };
};
