// 1. IMPORT: Bring in Jest's official configuration type.
import type { Config } from 'jest';

// 2. BASE CONFIGURATION: Define the behavior of the automated test runner.
const config: Config = {
  // A. ESM MODE: Treat .ts files as native ECMAScript Modules ("type": "module" in package.json).
  // This replaces the old 'ts-jest/presets/default-esm' preset. ts-jest was never the active
  // transformer (the SWC transform below overrides it) and it pulled in a vulnerable
  // handlebars release, so it was removed (remediation log entry DEP-01).
  extensionsToTreatAsEsm: ['.ts'],

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
