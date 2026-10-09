// 1. IMPORTS: Bring in the database contract (interface) and User structure.
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';

// 2. SERVICE CLASS: Business rules live here, at the heart of the system.
// It delegates database operations to the repository.
export class UserService {
  
  // DEPENDENCY INJECTION: The constructor does not create the database or repository itself.
  // The caller must provide a repository that implements IUserRepository.
  constructor(private userRepository: IUserRepository) {}

  // FUNCTION 1: Forward the request to the repository to retrieve all users.
  // Pagination is supported through the 'limit' and 'offset' options.
  async getAllUsers(options:{ limit: number; offset: number }): Promise<User[]> {    
    // Extract the two numeric values from the options object.
    const { limit, offset } = options;
  
    // Pass both values to the repository method.
    return this.userRepository.findAll(limit, offset);
  }

  // FUNCTION 2: Ask the repository to find the user with the ID from the route.
  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  // FUNCTION 3: Apply the business rules: accept the raw name and email,
  // generate a unique ID, and build the complete User object.
  // Then ask the repository to persist it.
  async createUser(name: string, email: string): Promise<User> {
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 9), // Generate a random ID string (for example, "7z8x9w2")
      name,
      email
    };
    return this.userRepository.create(newUser);
  }
}
