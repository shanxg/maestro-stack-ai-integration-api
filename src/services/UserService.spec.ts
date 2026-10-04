// 🔥 CORREÇÃO PARA O MOTOR SWC: Importa o objeto 'jest' explicitamente para o ambiente de Módulos Nativos (ESM)
import { jest } from '@jest/globals';

// 1. IMPORTAÇÕES: Trazemos o serviço que queremos testar e a interface do contrato do repositório
import { UserService } from './UserService.js';
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';

// 2. CONSTRUÇÃO DO MOCK (DUBLE DE TESTE): Criamos um objeto com as mesmas funções do repositório real
// Usamos o 'jest.fn()' para criar funções espiãs que conseguimos controlar e monitorar nos testes
const mockUserRepository: jest.Mocked<IUserRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

// 3. BLOCO DE TESTES DO SERVIÇO: Agrupa os testes relacionados ao UserService
describe('UserService (Testes Unitários)', () => {
  let userService: UserService;

  // O bloco 'beforeEach' roda uma vez antes de cada teste individual, garantindo um ambiente limpo
  beforeEach(() => {
    // Limpa o histórico de execuções das funções espiãs para um teste não poluir o outro
    jest.clearAllMocks();
    // Instancia o serviço injetando o nosso repositório de mentira (Mock)
    userService = new UserService(mockUserRepository);
  });

  // TESTE 1: Valida se o serviço gera o ID aleatório e chama a persistência corretamente
  it('deve gerar um ID aleatório e criar um usuário com sucesso', async () => {
    // Configura o comportamento do Mock: quando a função 'create' for chamada, ela deve retornar o usuário aceito
    mockUserRepository.create.mockImplementation(async (user: User) => user);

    const name = 'Lucas Teste';
    const email = 'lucas@teste.com';

    // Aciona a função real do serviço passando os dados de entrada
    const result = await userService.createUser(name, email);

    // ASSERÇÕES (EXPECTS): As checagens de validação que o Jest faz para carimbar o sucesso
    expect(result).toHaveProperty('id'); // Verifica se a propriedade 'id' foi gerada e existe no objeto
    expect(result.name).toBe(name);       // Confere se o nome retornado é exatamente o nome enviado
    expect(result.email).toBe(email);     // Confere se o e-mail retornado é exatamente o e-mail enviado
    
    // Verifica se a camada de serviço realmente chamou a função de persistência do repositório uma única vez
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
  });

  // 🔥 TESTE 2 ADICIONADO: Valida a listagem paginada (Cobre as linhas de busca geral)
  it('deve retornar uma lista de usuários de forma paginada', async () => {
    const mockUsersList: User[] = [
      { id: '1', name: 'User One', email: 'one@test.com' },
      { id: '2', name: 'User Two', email: 'two@test.com' }
    ];

    // Mockamos a resposta do findAll para devolver a nossa lista de simulação
    mockUserRepository.findAll.mockResolvedValue(mockUsersList);

    const options = { limit: 10, offset: 0 };
    const result = await userService.getAllUsers(options);

    expect(result).toHaveLength(2); // Garante que vieram os 2 usuários mapeados
    expect(result[0]?.name).toBe('User One');
    expect(mockUserRepository.findAll).toHaveBeenCalledWith(options.limit, options.offset);
  });

  // 🔥 TESTE 3 ADICIONADO: Valida a busca por ID único (Garante 100% de cobertura)
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
