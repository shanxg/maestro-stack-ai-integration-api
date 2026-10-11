export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Optional property for hashed password
}
