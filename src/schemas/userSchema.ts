// Import the structural validation engine from Zod
import { z } from 'zod';
// Fixed limits (page size cap) shared with the rest of the API
import { settings } from '../config.js';

// VALIDATION SCHEMA: Define the exact shape required for the request body block
export const createUserSchema = z.object({
  body: z.object({
    // Name is required, must be a string, and must contain at least three characters
    name: z
      .string({
        message: 'O nome é obrigatório.'
      })
      .min(3, 'O nome deve conter pelo menos 3 caracteres.'),

    // Email is required and must use a valid RFC-compliant email structure
    email: z
      .string({
        message: 'O e-mail é obrigatório.'
      })
      .email({ message: 'Insira um formato de e-mail válido (exemplo: usuario@email.com).' }),

    // APPSEC REMEDIATION - ENFORCE PASSWORD COMPLEXITY AT INGESTION EDGE (CWE-521)
    // Enforces a mandatory minimum string size block to mitigate weak credential exploits.
    password: z
      .string({
        message: 'A senha é obrigatória.'
      })
      .min(8, { message: 'A senha deve conter pelo menos 8 caracteres.' })
  })
});

// VALIDATION SCHEMA (GET /api/v1/users/{id}, issue #49): the id in the path. A blank id used to get a
// hand-written 400 BAD_REQUEST from the controller; now it fails here like every other input, with the
// shared VALIDATION_FAILURE envelope. Ids are UUIDs stored in a VARCHAR(50) column, so anything
// longer cannot exist and is rejected before the database is queried.
export const userIdParamsSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'O id do usuário é obrigatório.' })
      .trim()
      .min(1, { message: 'O id do usuário não pode ser vazio.' })
      .max(50, { message: 'O id do usuário pode ter no máximo 50 caracteres.' })
  })
});

// VALIDATION SCHEMA (GET /api/v1/users): Query values always arrive as text, so z.coerce converts
// them to numbers before the checks. A missing value falls back to the default.
export const listUsersSchema = z.object({
  query: z.object({
    // Page size: a whole number between 1 and the cap in src/config.ts
    limit: z.coerce
      .number({ message: 'O limit deve ser um número.' })
      .int({ message: 'O limit deve ser um número inteiro.' })
      .min(1, { message: 'O limit deve ser no mínimo 1.' })
      .max(settings.pagination.maxLimit, { message: `O limit deve ser no máximo ${settings.pagination.maxLimit}.` })
      .default(settings.pagination.defaultLimit),

    // Records skipped before the page starts: a whole number, zero or more
    offset: z.coerce
      .number({ message: 'O offset deve ser um número.' })
      .int({ message: 'O offset deve ser um número inteiro.' })
      .min(0, { message: 'O offset não pode ser negativo.' })
      .default(0)
  })
});
