// 1. IMPORT: Bring in the structural validation engine from Zod.
import { z } from 'zod';

// 2. VALIDATION SCHEMA: Define the exact shape required for the request body.
export const createUserSchema = z.object({
  
  body: z.object({
    // Name is required, must be a string, and must contain at least three characters.
    name: z.string({
      message: 'O nome é obrigatório.'
    }).min(3, 'O nome deve conter pelo menos 3 caracteres.'),
    
    // Email is required and must use a valid email format (including @ and a domain).
    email: z.string({
      message: 'O e-mail é obrigatório.'
    }).email({ message: 'Insira um formato de e-mail válido (exemplo: usuario@email.com).' })
  })

});
