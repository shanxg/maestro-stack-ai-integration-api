// Import the structural validation engine from Zod
import { z } from 'zod';

// VALIDATION SCHEMA: Define the exact shape required for the request body block
export const createUserSchema = z.object({
  body: z.object({
    // Name is required, must be a string, and must contain at least three characters
    name: z.string({
      message: 'O nome é obrigatório.'
    }).min(3, 'O nome deve conter pelo menos 3 caracteres.'),
    
    // Email is required and must use a valid RFC-compliant email structure
    email: z.string({
      message: 'O e-mail é obrigatório.'
    }).email({ message: 'Insira um formato de e-mail válido (exemplo: usuario@email.com).' }),

    // APPSEC REMEDIATION - ENFORCE PASSWORD COMPLEXITY AT INGESTION EDGE (CWE-521)
    // Enforces a mandatory minimum string size block to mitigate weak credential exploits.
    password: z.string({
      message: 'A senha é obrigatória.'
    }).min(8, { message: 'A senha deve conter pelo menos 8 caracteres.' })
  })
});