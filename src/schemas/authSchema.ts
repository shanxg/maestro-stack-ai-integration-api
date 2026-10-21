// Import the structural validation engine from Zod
import { z } from 'zod';

// VALIDATION SCHEMA (POST /api/v1/auth/login): Both fields must be text. A number, an array or a
// missing body is rejected with 400 before the database lookup and the bcrypt comparison.
export const loginSchema = z.object({
  body: z.object({
    // E-mail used as the account name. Surrounding spaces are removed before the lookup.
    username: z
      .string({
        message: 'The e-mail (username) is required and must be a string.'
      })
      .trim()
      .min(1, { message: 'The e-mail (username) cannot be blank.' }),

    // The password is compared exactly as typed (no trim), because registration stores it unchanged.
    // It only needs at least one character that is not a space.
    password: z
      .string({
        message: 'The password is required and must be a string.'
      })
      .regex(/\S/, { message: 'The password cannot be blank.' })
  })
});
