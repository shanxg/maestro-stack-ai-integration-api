// 1. IMPORTAÇÕES: Traz o contrato do banco de dados (Interface) e a estrutura do Usuário.
import { type IUserRepository } from '../interfaces/IUserRepository.js';
import { type User } from '../models/User.js';

// 2. A CLASSE DE SERVIÇO: É aqui que ficam as "regras de negócio" (o coração do sistema).
// Ela não mexe no banco direto; ela pede para o repositório fazer isso por ela.
export class UserService {
  
  // INJEÇÃO DE DEPENDÊNCIA: O construtor NÃO cria o banco de dados sozinho (não faz 'new UserRepository()').
  // Ele simplesmente avisa: "Quem me instanciar, precisa me entregar um repositório pronto que siga o molde IUserRepository".
  constructor(private userRepository: IUserRepository) {}

  // FUNÇÃO 1: Apenas repassa o pedido para o repositório buscar todos os usuários e nos devolver.
  // Aqui, adicionamos suporte à paginação, recebendo um objeto com 'limit' e 'offset'.
  async getAllUsers(options:{ limit: number; offset: number }): Promise<User[]> {    
    // Desestrutura o objeto para capturar as duas variáveis numéricas
    const { limit, offset } = options;
  
    // Repassa ambos os valores diretamente para o método do repositório
    return this.userRepository.findAll(limit, offset);
  }

  // FUNÇÃO 2: Recebe o ID vindo da rota e pede para o repositório procurar o usuário correspondente.
  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  // FUNÇÃO 3: Aqui está a lógica de negócio! O serviço recebe os dados brutos (nome e email),
  // gera um ID único e seguro usando matemática aleatória e monta o objeto 'User' completo.
  // Depois, joga o usuário montado para o repositório salvar de verdade.
  async createUser(name: string, email: string): Promise<User> {
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 9), // Cria uma string de ID aleatória (ex: "7z8x9w2")
      name,
      email
    };
    return this.userRepository.create(newUser);
  }
}
