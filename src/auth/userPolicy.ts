// 1. IMPORTS: The verified token claims that every rule below is decided on.
import { type AccessTokenClaims } from './accessToken.js';

/**
 * 🔑 USER ACCESS RULES (OWASP API1:2023 BOLA / API5:2023 BFLA):
 * Who may read which user records. Before, any logged-in account could list every user and read
 * any record by its id. The rules are pure functions over the claims of a token that
 * verifyAccessToken() has already checked, so any entry point can apply exactly the same rules.
 *
 * There is no generic RBAC: one ADMIN role, set in the database, and everyone else (USER)
 * may only see their own record.
 */

// An administrator, as recorded in the users table and copied into the JWT at login.
export function isAdmin(requester: AccessTokenClaims): boolean {
  return requester.role === 'ADMIN';
}

// Listing every account is an administrative function (BFLA): only admins may do it.
export function canListUsers(requester: AccessTokenClaims): boolean {
  return isAdmin(requester);
}

// A user record is visible to its owner and to admins (BOLA). The rule runs before the database
// lookup, so another account's id gets the same answer whether that account exists or not.
export function canReadUser(requester: AccessTokenClaims, userId: string): boolean {
  return requester.id === userId || isAdmin(requester);
}
