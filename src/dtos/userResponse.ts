// 1. IMPORT: The internal user record, as the repository returns it.
import { type User } from '../models/User.js';

/**
 * 📤 PUBLIC USER VIEW (DTO, issue #48 — OWASP API3:2023):
 * The only shape in which a user record leaves the API. The internal User model may carry the
 * bcrypt password hash (findByEmail selects it for the login) and the role, and new columns may
 * be added to the table later. Before, the controllers sent whatever the service returned, so
 * the response depended on which columns each SQL query happened to select.
 *
 * This is an ALLOWLIST: only the fields named here are copied. A field added to User or to a
 * query later stays internal until someone adds it here on purpose; a denylist (deleting
 * 'password') would silently publish every new field instead.
 */
export type UserResponse = Pick<User, 'id' | 'name' | 'email'>;

// Build the public view of one record: a new object with exactly the three public fields.
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}
