// Access level of an account (OWASP API5:2023). There is no generic RBAC: ADMIN may list every
// account and read any record; USER (the default for every new account) only sees its own.
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Optional property for hashed password
  role?: UserRole;   // Read at login and copied into the JWT; never returned by the user routes
}
