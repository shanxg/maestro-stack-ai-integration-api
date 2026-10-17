// Import the structural validation engine from Zod
import { z } from 'zod';

// VALIDATION SCHEMA (POST /api/v1/auth/login): Both fields must be text. A number, an array or a
// missing body is rejected with 400 before the database lookup and the bcrypt comparison.
export const loginSchema = z.object({
  body: z.object({
    // E-mail used as the account name. Surrounding spaces are removed before the lookup.
    username: z
      .string({
        message: 'O e-mail (username) é obrigatório e precisa ser um texto.'
      })
      .trim()
      .min(1, { message: 'O e-mail (username) não pode ficar em branco.' }),

    // The password is compared exactly as typed (no trim), because registration stores it unchanged.
    // It only needs at least one character that is not a space.
    password: z
      .string({
        message: 'A senha (password) é obrigatória e precisa ser um texto.'
      })
      .regex(/\S/, { message: 'A senha (password) não pode ficar em branco.' })
  })
});
