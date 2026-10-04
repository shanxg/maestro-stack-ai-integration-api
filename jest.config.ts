// 1. IMPORTAÇÃO: Traz o tipo estrutural de configurações oficial do próprio Jest
import type { Config } from 'jest';

// 2. CONFIGURAÇÃO MATRIZ: Define o comportamento do motor de testes automatizados
const config: Config = {
  // A. PRESET: Diz ao Jest para utilizar o 'ts-jest' na variante ESM (Módulos Nativos do Node)
  // Isso ensina o robô a compilar TypeScript em tempo de execução respeitando o formato de módulos do projeto!
  preset: 'ts-jest/presets/default-esm',

  // B. AMBIENTE DE EXECUÇÃO: Define que os testes vão rodar simulando o ecossistema do Node.js
  testEnvironment: 'node',

  // C. MAPEAMENTO DE COMPILAÇÃO (TRANSFORM): Associa arquivos .ts ao motor do ts-jest
  // Configura o suporte a ECMAScript Modules para aceitar as importações estritas do TypeScript v7
   transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: false,
          },
          target: 'esnext',
        },
      },
    ],
  },

  // D. RESOLUÇÃO DE EXTENSÕES NATIVAS (.js para .ts):
  // Como no código importamos usando 'from "./UserService.js"', o Jest precisa dessa regra de expressão regular
  // para entender que na hora de testar ele deve ler fisicamente o arquivo original finalizado em '.ts'!
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // E. EXCLUSÃO DE PASTAS: Impede que o robô perca tempo varrendo as dependências instaladas ou a pasta de build
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // F. RELATÓRIO DE COBERTURA (COVERAGE): Configura o Jest para auditar quais linhas de código foram testadas
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};

// Exporta as diretivas de qualidade configuradas
export default config;
