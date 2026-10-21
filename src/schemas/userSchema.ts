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
        message: 'The name is required.'
      })
      .min(3, 'The name must have at least 3 characters.'),

    // Email is required and must use a valid RFC-compliant email structure
    email: z
      .string({
        message: 'The e-mail is required.'
      })
      .email({ message: 'Enter a valid e-mail format (for example: user@example.com).' }),

    // APPSEC REMEDIATION - ENFORCE PASSWORD COMPLEXITY AT INGESTION EDGE (CWE-521)
    // Enforces a mandatory minimum string size block to mitigate weak credential exploits.
    password: z
      .string({
        message: 'The password is required.'
      })
      .min(8, { message: 'The password must have at least 8 characters.' })
  })
});

// VALIDATION SCHEMA (GET /api/v1/users/{id}, issue #49): the id in the path. A blank id used to get a
// hand-written 400 BAD_REQUEST from the controller; now it fails here like every other input, with the
// shared VALIDATION_FAILURE envelope. Ids are UUIDs stored in a VARCHAR(50) column, so anything
// longer cannot exist and is rejected before the database is queried.
export const userIdParamsSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'The user id is required.' })
      .trim()
      .min(1, { message: 'The user id cannot be empty.' })
      .max(50, { message: 'The user id can have at most 50 characters.' })
  })
});

// VALIDATION SCHEMA (GET /api/v1/users): Query values always arrive as text, so z.coerce converts
// them to numbers before the checks. A missing value falls back to the default.
export const listUsersSchema = z.object({
  query: z.object({
    // Page size: a whole number between 1 and the cap in src/config.ts
    limit: z.coerce
      .number({ message: 'The limit must be a number.' })
      .int({ message: 'The limit must be an integer.' })
      .min(1, { message: 'The limit must be at least 1.' })
      .max(settings.pagination.maxLimit, { message: `The limit must be at most ${settings.pagination.maxLimit}.` })
      .default(settings.pagination.defaultLimit),

    // Records skipped before the page starts: a whole number, zero or more
    offset: z.coerce
      .number({ message: 'The offset must be a number.' })
      .int({ message: 'The offset must be an integer.' })
      .min(0, { message: 'The offset cannot be negative.' })
      .default(0)
  })
});
