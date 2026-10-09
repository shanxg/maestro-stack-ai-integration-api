// 🔥 SWC COMPATIBILITY: Explicitly import 'jest' for the native ESM environment.
import { jest } from '@jest/globals';

// 1. IMPORTS: Bring in the service under test and the repository contract interface.
import { UserService } from './UserService.js';
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';

// 2. BUILD THE MOCK: Create an object with the same methods as the real repository.
// Use 'jest.fn()' to create spy functions that can be controlled and inspected in tests.
const mockUserRepository: jest.Mocked<IUserRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
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

    // Call the real service method with the input data.
    const result = await userService.createUser(name, email);

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
});
