// 1. IMPORTAÇÕES: Traz a estrutura do UserService para podermos manipular as ações reais do sistema.
import { UserService } from '../services/UserService.js';
import { UserRepository } from '../repositories/UserRepository.js';

// 2. INICIALIZAÇÃO DA CAMADA DE INJEÇÃO: Instanciamos o serviço da mesma forma que fizemos no app.ts
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

// 3. DEFINIÇÃO DOS RESOLVERS: Objeto que contém a implementação real das Queries e Mutations do schema.
export const userResolvers = {
  
  // Bloco de leitura correspondente ao 'type Query' do arquivo .graphql
  Query: {
    // Retorna todos os usuários. Passamos limit fixo de 100 e offset 0 por padrão para simplificar no GraphQL.
    users: async (): Promise<any[]> => {
      return userService.getAllUsers({ limit: 100, offset: 0 });
    },

    // Busca um usuário específico varrendo o argumento 'id' extraído da chamada GraphQL
    user: async (_parent: any, args: { id: string }): Promise<any | null> => {
      return userService.getUserById(args.id);
    }
  },

  // Bloco de modificação correspondente ao 'type Mutation' do arquivo .graphql
  Mutation: {
    // Cria um usuário acionando o método do serviço e devolve o objeto criado de volta
    createUser: async (_parent: any, args: { name: string; email: string }): Promise<any> => {
      const { name, email } = args;
      return userService.createUser(name, email);
    }
  }

};
