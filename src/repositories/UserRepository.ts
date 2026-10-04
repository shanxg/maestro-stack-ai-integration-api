// 1. IMPORTAÇÕES: Traz o contrato (molde) que criamos e a estrutura de dados do Usuário.
import { type IUserRepository } from "../interfaces/IUserRepository.js";
import { type User } from "../models/User.js";


// 2. A CLASSE: O 'implements IUserRepository' avisa ao TypeScript que esta classe 
// é OBRIGADA a programar e respeitar as 3 funções exigidas pelo contrato (findAll, findById, create).
export class UserRepository implements IUserRepository {
  
  // O NOSSO "BANCO DE DADOS": Como não estamos usando um banco real (como PostgreSQL),
  // guardamos os dados em um array [] comum. O 'private' impede que arquivos de fora mexam aqui direto.
  private users: User[] = [];

  // 3. FUNÇÕES: Aqui estão as 3 funções exigidas pelo contrato (IUserRepository).

  // <OLD>
  // FUNÇÃO 1: Devolve a lista inteira (o array completo) com todos os usuários cadastrados.
  // Usamos 'async' porque simula uma resposta de banco de dados real (que leva tempo).
  //             async findAll(): Promise<User[]> {
  //               return this.users;
  //             }
  // </OLD>
              
  // FUNÇÃO 1 (findAll Pagina): Executa o recorte lógico com base nas coordenadas numéricas recebidas.
  async findAll(limit: number, offset: number): Promise<User[]> {
    // .slice(offset, offset + limit) extrai o intervalo exato de dados pedidos da esteira.
    // Exemplo: offset = 10, limit = 10 -> extrai os dados localizados da posição 10 até a 20.
    return this.users.slice(offset, offset + limit);
  }

  // FUNÇÃO 2: Recebe um ID e usa o método '.find()' do JavaScript para procurar no array.
  // Se achar, devolve o usuário. Se não achar, o operador '|| null' garante que retorne nulo.
  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) || null;
  }

  // FUNÇÃO 3: Recebe um novo usuário pronto, joga ele para dentro do nosso array com o '.push()'
  // e depois devolve o próprio usuário para confirmar que ele foi salvo com sucesso.
  async create(user: User): Promise<User> {
    this.users.push(user);
    return user;
  }  
}


