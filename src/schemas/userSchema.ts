// 1. IMPORTAÇÃO: Traw o motor de validação estrutural da biblioteca Zod
import { z } from 'zod';

// 2. O SCHEMA DE VALIDAÇÃO: Define o molde exato que o corpo (body) da requisição deve seguir.
export const createUserSchema = z.object({
  
  body: z.object({
    // O nome é obrigatório, precisa ser string e ter no mínimo 3 letras
    name: z.string({
      message: 'O nome é obrigatório.'
    }).min(3, 'O nome deve conter pelo menos 3 caracteres.'),
    
    // O e-mail é obrigatório e precisa obrigatoriamente ter formato válido de e-mail (conter @ e domínio)
    email: z.string({
      message: 'O e-mail é obrigatório.'
    }).email({ message: 'Insira um formato de e-mail válido (exemplo: usuario@email.com).' })
  })

});
