/**
 * 🧹 ESLINT CONFIG FOR THE API (issue #55)
 *
 * Run from the repository root with `npm run lint`, which calls
 * `eslint --config tools/lint/eslint.config.js .`. When a config is passed with --config, ESLint
 * resolves the file patterns below from the current working directory, so 'src/**' means the
 * repository's src/ folder.
 *
 * WHY THIS FILE LIVES IN tools/lint/ (with its own package.json):
 * typescript-eslint parses TypeScript with the compiler's JavaScript API and supports only
 * TypeScript < 6.1. The API compiles with TypeScript 7, whose npm package no longer ships that API
 * (its main export is only the version number). npm cannot install a second TypeScript for a peer
 * dependency inside one package, so the linter gets its own package with TypeScript 6.0.3, and this
 * config imports its plugins from there. The build and `npm run typecheck` still use TypeScript 7.
 *
 * WHAT IT CHECKS:
 * - @eslint/js recommended: likely bugs in any JavaScript (unreachable code, undefined names...).
 * - typescript-eslint recommendedTypeChecked: rules that use the type information, such as promises
 *   that are never awaited (a rejected one crashes Node or is lost) or `any` values flowing into
 *   typed code, which is how unvalidated input slips past the Zod schemas.
 * - eslint-plugin-security recommended: lightweight SAST for Node patterns (non-literal RegExp, fs
 *   paths or require() built from variables, eval with an expression, timing-unsafe comparisons...).
 * The frontend keeps its own config (frontend/eslint.config.mjs), with the Next.js rules.
 */
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

// The repository root: where the tsconfig files that typed linting reads are looked up from.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig([
  // Not linted here: build and coverage output, and the Next.js app, which has its own config.
  // (Every node_modules folder is ignored by ESLint by default.)
  // .venv/ is the local Python environment of sync_backlog.py (gitignored).
  globalIgnores(['dist/**', 'coverage/**', 'frontend/**', '.venv/**']),

  // 1. Every JavaScript and TypeScript file: the core recommended rules, the security rules and the
  //    Node.js globals (process, Buffer, console...), since everything linted here runs on Node.
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    }
  },

  // 2. TypeScript files: the type-aware rules. The project service finds each file's nearest
  //    tsconfig.json (the root one for src/, tests/tsconfig.json for the tests), so the rules see
  //    the same types as the compiler. jest.config.ts belongs to no tsconfig on purpose (it is not
  //    built), so it is checked with the default compiler options instead.
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['jest.config.ts'] },
        tsconfigRootDir: repoRoot
      }
    },
    rules: {
      // `declare global { namespace Express { ... } }` is how TypeScript adds req.user to Express's
      // own types (src/middlewares/authMiddleware.ts). Declarations are allowed; runtime
      // namespaces are still refused, since ES modules replace them.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // Off on purpose: an async function that does not await (EventBrokerService.publishEvent, the
      // readiness broker check) still always returns a promise and turns a synchronous throw into a
      // rejection, which its callers and Express 5 already handle. The rule would push those
      // functions back to plain ones that can throw synchronously.
      '@typescript-eslint/require-await': 'off',
      // A leading underscore marks a value that is unused on purpose, such as an Express argument
      // that must stay in the signature or a property removed from an object by destructuring.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ]
    }
  },

  // 3. Test files: the same rules, minus some that only fit production code.
  //    - unbound-method: `expect(mock.method).toHaveBeenCalled()` passes a method without calling
  //      it, which is the whole point of a Jest assertion, not a lost `this`.
  //    - no-unsafe-*: tests read `any` on purpose (JSON bodies from supertest, mock.calls) and check
  //      them with expect() right after.
  //    - detect-non-literal-fs-filename / detect-object-injection / detect-non-literal-regexp: the
  //      tests read the repository's own files and build patterns from their own constants; no
  //      outside input reaches them.
  {
    files: ['tests/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  }
]);
