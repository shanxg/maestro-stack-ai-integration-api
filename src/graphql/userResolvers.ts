// 1. IMPORTS: Bring in UserService to perform the system's operations.
import { UserService } from '../services/UserService.js';
import { UserRepository } from '../repositories/UserRepository.js';

// 2. DEPENDENCY INITIALIZATION: Instantiate the service as in app.ts.
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

// 3. RESOLVER DEFINITIONS: Implement the schema's queries and mutations.
export const userResolvers = {
  
  // Read operations corresponding to the GraphQL 'type Query' block.
  Query: {
    // Return all users with a fixed limit of 100 and offset of 0 for simplicity.
    users: async (): Promise<any[]> => {
      return userService.getAllUsers({ limit: 100, offset: 0 });
    },

    // Find a user using the 'id' argument from the GraphQL call.
    user: async (_parent: any, args: { id: string }): Promise<any | null> => {
      return userService.getUserById(args.id);
    }
  },

  // Write operations corresponding to the GraphQL 'type Mutation' block.
  Mutation: {
    // Create a user through the service and return the created object.
    createUser: async (_parent: any, args: { name: string; email: string }): Promise<any> => {
      const { name, email } = args;
      return userService.createUser(name, email);
    }
  }

};
