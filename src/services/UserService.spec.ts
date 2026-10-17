// 🔥 SWC COMPATIBILITY: Explicitly import 'jest' for the native ESM environment.
import { jest } from '@jest/globals';

// 1. IMPORTS: Bring in the service under test and the repository contract interface.
import { UserService } from './UserService.js';
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';
import bcrypt from 'bcrypt';
import { settings } from '../config.js';

// 2. BUILD THE MOCK: Create an object with the same methods as the real repository.
// Use 'jest.fn()' to create spy functions that can be controlled and inspected in tests.
const mockUserRepository: jest.Mocked<IUserRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
};

// 3. SERVICE TESTS: Group tests related to UserService.
describe('UserService (Testes Unitários)', () => {
  let userService: UserService;

  // Run 'beforeEach' before every test to ensure a clean environment.
  beforeEach(() => {
    // Clear spy call history so one test does not affect another.
    jest.clearAllMocks();
    // Instantiate the service with the mock repository.
    userService = new UserService(mockUserRepository);
  });

  // TEST 1: Verify that the service generates a random ID and calls persistence correctly.
  it('deve gerar um ID aleatório e criar um usuário com sucesso', async () => {
    // Configure the mock to return the user passed to 'create'.
    mockUserRepository.create.mockImplementation(async (user: User) => user);

    const name = 'Lucas Teste';
    const email = 'lucas@teste.com';
    const password = 'cryptographic_password_string_123'; // APPSEC REMEDIATION: Inject mock credential token

    // Call the real service method with the input data vector.
    const result = await userService.createUser(name, email, password);

    // ASSERTIONS: Verify the expected values.
    expect(result).toHaveProperty('id'); // Confirm that an ID was generated
    expect(result.name).toBe(name);       // Confirm that the returned name matches the input
    expect(result.email).toBe(email);     // Confirm that the returned email matches the input
    
    // Verify that the service called the repository persistence method exactly once.
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
  });

  // 🔥 TEST 2: Verify paginated listing (covers the general lookup path).
  it('deve retornar uma lista de usuários de forma paginada', async () => {
    const mockUsersList: User[] = [
      { id: '1', name: 'User One', email: 'one@test.com' },
      { id: '2', name: 'User Two', email: 'two@test.com' }
    ];

    // Make findAll return the simulated list.
    mockUserRepository.findAll.mockResolvedValue(mockUsersList);

    const options = { limit: 10, offset: 0 };
    const result = await userService.getAllUsers(options);

    expect(result).toHaveLength(2); // Confirm that both users were returned
    expect(result[0]?.name).toBe('User One');
    expect(mockUserRepository.findAll).toHaveBeenCalledWith(options.limit, options.offset);
  });

  // 🔥 TEST 3: Verify lookup by ID (covers the ID lookup path).
  it('deve retornar um usuário específico ao buscar por um ID válido', async () => {
    const mockUser: User = { id: '123', name: 'User Target', email: 'target@test.com' };
    
    mockUserRepository.findById.mockResolvedValue(mockUser);

    const result = await userService.getUserById('123');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('123');
    expect(result?.name).toBe('User Target');
    expect(mockUserRepository.findById).toHaveBeenCalledWith('123');
  });

  // TEST 4: Verify a password that looks like a bcrypt hash is still hashed (issue #41, CWE-916).
  // Condition: An outside caller sends a "$2a$04$..." string as the password (the retired GraphQL mutation could).
  it('hashes a password from outside even when it already looks like a bcrypt hash', async () => {
    mockUserRepository.create.mockImplementation(async (user: User) => user);
    const hashLikePassword = (await bcrypt.hash('weak-and-cheap', 4)).replace(/^\$2b\$/, '$2a$');

    await userService.createUser('Lucas Hash', 'lucas.hash@maestro.com', hashLikePassword);

    const stored = mockUserRepository.create.mock.calls[0]?.[0].password as string;
    expect(stored).not.toBe(hashLikePassword);
    expect(bcrypt.getRounds(stored)).toBe(settings.bcryptSaltRounds);
    expect(await bcrypt.compare(hashLikePassword, stored)).toBe(true);
  });

  // TEST 5: Verify the queue's trusted path stores a hash made by hashPassword() unchanged.
  // Condition: The hash has the configured cost, as UserController produces it.
  it('stores a bcrypt hash with the configured cost unchanged through createUserWithPasswordHash', async () => {
    mockUserRepository.create.mockImplementation(async (user: User) => user);
    const passwordHash = await userService.hashPassword('queued-password');

    await userService.createUserWithPasswordHash('Lucas Fila', 'lucas.fila@maestro.com', passwordHash);

    expect(mockUserRepository.create.mock.calls[0]?.[0].password).toBe(passwordHash);
  });

  // TEST 6: Verify the trusted path refuses anything that is not a full hash with the configured cost.
  // Condition: Plaintext, a truncated hash and a cost-4 hash never reach the repository.
  it('rejects plaintext, malformed and low-cost hashes in createUserWithPasswordHash', async () => {
    const lowCostHash = await bcrypt.hash('weak-and-cheap', 4);
    const rejected = ['plain-text-password', '$2b$12$short', lowCostHash];

    for (const value of rejected) {
      await expect(userService.createUserWithPasswordHash('Lucas Fila', 'lucas.fila@maestro.com', value)).rejects.toThrow();
    }
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });

  // TEST 7: Verify the login lookup goes through the IUserRepository contract (issue #47).
  // Condition: The mock repository holds the account; then a repository without findByEmail is used.
  it('reads an account by e-mail through IUserRepository and fails loudly when findByEmail is missing', async () => {
    const account: User = { id: 'abc-777', name: 'Lucas Login', email: 'lucas.login@maestro.com', password: '$2b$12$hash', role: 'USER' };
    mockUserRepository.findByEmail.mockResolvedValue(account);

    // The service returns the repository's record as it is, hash and role included (the login needs both).
    await expect(userService.getUserByEmail('lucas.login@maestro.com')).resolves.toBe(account);
    expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('lucas.login@maestro.com');

    // COMPILE-TIME CHECK (npx tsc --noEmit): findByEmail is now part of the contract, so a repository
    // without it is a type error. If the method ever leaves the interface again, this directive is
    // unused and tsc fails with "Unused '@ts-expect-error' directive".
    // @ts-expect-error findByEmail is required by IUserRepository
    const incompleteRepository: IUserRepository = { findAll: jest.fn(), findById: jest.fn(), create: jest.fn() };

    // RUNTIME CHECK: before, the service probed for the method through an 'any' cast and answered null
    // when it was missing, so every login failed with a 401 that looked like wrong credentials.
    // Now the missing method is a programming error that surfaces at once.
    await expect(new UserService(incompleteRepository).getUserByEmail('lucas.login@maestro.com')).rejects.toThrow(TypeError);
  });
});
