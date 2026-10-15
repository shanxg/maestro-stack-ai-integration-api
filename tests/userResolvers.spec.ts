// 1. IMPORTS: Bring in Jest utilities, the GraphQL error class, and the resolver factory.
import crypto from 'node:crypto';
import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { createUserResolvers } from '../src/graphql/userResolvers.js';
import type { UserService } from '../src/services/UserService.js';

// 🏭 SERVICE MOCK: Only createUser is needed. It records calls, which proves
// that invalid input never reaches the business layer.
const createUserMock = jest.fn<UserService['createUser']>(async (name, email) => ({ id: 'gql-id', name, email }));
const resolvers = createUserResolvers({ createUser: createUserMock } as unknown as UserService);

// 🔐 AUTHENTICATED CONTEXT: The same shape the Apollo JWT firewall in app.ts builds.
const authenticatedContext = { user: { id: 'admin-id' } };

describe('GraphQL createUser mutation (VAL-01 regression)', () => {
  // Clear the call history so one test does not affect another.
  beforeEach(() => {
    createUserMock.mockClear();
  });

  // TEST 1: Verify the mutation enforces the same Zod rules as POST /api/v1/users.
  // Condition: Short name, malformed e-mail, and a password below the 8-character policy.
  it('rejects invalid input with BAD_USER_INPUT and never calls the service', async () => {
    const result = resolvers.Mutation.createUser(
      null,
      { name: 'Lu', email: 'email_invalido', password: '123' },
      authenticatedContext
    );

    await expect(result).rejects.toBeInstanceOf(GraphQLError);
    await expect(result).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' })
        ])
      }
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  // TEST 2: Verify the validation does not block legitimate registrations.
  // Condition: Valid input must reach UserService.createUser unchanged.
  it('passes valid input to UserService.createUser', async () => {
    const validArgs = {
      name: 'Lucas GraphQL',
      email: 'lucas.graphql@maestro.com',
      password: crypto.randomUUID()
    };

    const created = await resolvers.Mutation.createUser(null, validArgs, authenticatedContext);

    expect(createUserMock).toHaveBeenCalledWith(validArgs.name, validArgs.email, validArgs.password);
    expect(created).toMatchObject({ id: 'gql-id' });
  });
});