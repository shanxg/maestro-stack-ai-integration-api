import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // XSS guard for direct DOM writes (CWE-79, issue #55): no-unsanitized fails the lint when code
  // assigns a non-literal value to innerHTML / outerHTML or passes one to insertAdjacentHTML,
  // document.write and similar sinks. react/no-danger below covers the React way of doing the same;
  // together they keep every raw HTML sink out of the app.
  noUnsanitized.configs.recommended,
  {
    rules: {
      // XSS guard (CWE-79, issue #42): never inject raw HTML into the page. Content such as the
      // AI answer is rendered as text, which React escapes.
      'react/no-danger': 'error'
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts'
  ])
]);

export default eslintConfig;
