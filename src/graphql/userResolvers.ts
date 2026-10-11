import { UserService } from '../services/UserService.js';

/**
 * ARCHITECTURAL REMEDIATION: CONTEXTUAL GRAPHQL AUTHORIZATION
 * 
 * Extends graph execution nodes to explicitly check for the presence of a verified
 * 'context.user' identity block prior to executing database queries or rule evaluations.
 */
export const createUserResolvers = (userService: UserService) => {
  return {
    Query: {
      // Read operations corresponding to the GraphQL 'type Query' block.
      users: async (_parent: any, _args: any, context: any): Promise<any[]> => {
        // AppSec Barrier: Reject operation resolution if the firewall context mapping is null
        if (!context.user) {
          throw new Error('FORBIDDEN: Legitimate authentication identity mapping required.');
        }
        return userService.getAllUsers({ limit: 100, offset: 0 });
      },

      user: async (_parent: any, args: { id: string }, context: any): Promise<any | null> => {
        if (!context.user) {
          throw new Error('FORBIDDEN: Legitimate authentication identity mapping required.');
        }
        return userService.getUserById(args.id);
      }
    },

    Mutation: {
      // Write operations corresponding to the GraphQL 'type Mutation' block.
      createUser: async (_parent: any, args: { name: string; email: string; password: string }, context: any): Promise<any> => {
        // Administrative safeguard: GraphQL account provisioning can also be tied to permissions if needed
        if (!context.user) {
          throw new Error('FORBIDDEN: Legitimate authentication identity mapping required.');
        }
        const { name, email, password } = args;
        return userService.createUser(name, email, password);
      }
    }
  };
};
