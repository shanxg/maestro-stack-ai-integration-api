// 1. IMPORT: Bring in Jest's official configuration type.
import type { Config } from 'jest';

// 2. BASE CONFIGURATION: Define the behavior of the automated test runner.
const config: Config = {
  // A. PRESET: Use 'ts-jest' with ESM (Node native modules).
  // This configures TypeScript compilation at runtime using the project's module format.
  preset: 'ts-jest/presets/default-esm',

  // B. RUNTIME ENVIRONMENT: Run tests in Node.js.
  testEnvironment: 'node',

  // C. TRANSFORM: Map .ts files to the TypeScript transform.
  // Configure ECMAScript Modules support for TypeScript imports.
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

  // D. NATIVE EXTENSION RESOLUTION (.js to .ts):
  // Source imports use paths such as 'from "./UserService.js"'. This regular expression
  // tells Jest to resolve those imports to the original .ts files during tests.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // E. DIRECTORY EXCLUSIONS: Skip installed dependencies and build output.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // F. COVERAGE REPORT: Configure Jest to report which lines of code were tested.
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};

// Export the quality settings.
export default config;
