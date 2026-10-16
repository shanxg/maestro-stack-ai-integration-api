// 1. IMPORTS: Jest utilities and Node helpers to read the frontend sources.
// The frontend has no test runner of its own, so these checks run in the API suite (issue #42).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';

// The header list as Next.js receives it from next.config.ts.
type Header = { key: string; value: string };

// Find one header by name in a header list.
const headerValue = (headers: Header[], key: string) => headers.find((header) => header.key === key)?.value;

describe('Frontend security (Next.js app)', () => {
  // TEST 1: Verify next.config.ts sends the security headers on every route (CWE-79 / CWE-1021).
  // Condition: Load the real config and call its headers(); it must cover '/:path*' with a CSP that
  // allows only this app and the API, forbids framing and plugins, plus nosniff and a Referrer-Policy.
  it('next.config.ts -> sends the CSP and the other security headers on every route', async () => {
    // next.config.ts is compiled by Next.js as CommonJS and reads __dirname; this suite runs as ESM,
    // so provide it before importing the config (it only feeds the Turbopack root option).
    (globalThis as { __dirname?: string }).__dirname = path.resolve('frontend');
    const { default: config } = await import('../frontend/next.config.ts');

    expect(typeof config.headers).toBe('function');
    const rules = await config.headers!();
    const everyRoute = rules.find((rule) => rule.source === '/:path*');
    expect(everyRoute).toBeDefined();

    const headers = everyRoute!.headers as Header[];
    const csp = headerValue(headers, 'Content-Security-Policy') ?? '';
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self' http://localhost:3000",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ]) {
      expect(csp).toContain(directive);
    }
    expect(headerValue(headers, 'X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue(headers, 'X-Frame-Options')).toBe('DENY');
    expect(headerValue(headers, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  // TEST 2: Verify the policy is stricter in production than in development.
  // Condition: 'unsafe-eval' (needed by React's dev tooling) only in development, and
  // upgrade-insecure-requests only in production, where everything is served over https.
  it('security-headers.ts -> keeps unsafe-eval out of production and upgrades requests there', async () => {
    const { buildSecurityHeaders } = await import('../frontend/security-headers.ts');
    const apiOrigin = 'https://api.maestro.example';

    const production = headerValue(buildSecurityHeaders({ isDev: false, apiOrigin }), 'Content-Security-Policy') ?? '';
    const development = headerValue(buildSecurityHeaders({ isDev: true, apiOrigin }), 'Content-Security-Policy') ?? '';

    expect(production).not.toContain("'unsafe-eval'");
    expect(production).toContain('upgrade-insecure-requests');
    expect(production).toContain(`connect-src 'self' ${apiOrigin}`);
    expect(development).toContain("'unsafe-eval'");
    expect(development).not.toContain('upgrade-insecure-requests');
  });

  // TEST 3: Verify no page injects raw HTML (CWE-79 / OWASP LLM05:2025).
  // Condition: The chat page rendered the model's answer with dangerouslySetInnerHTML after DOMPurify;
  // no file in frontend/app may use that sink (ESLint's react/no-danger enforces the same rule).
  it('frontend/app -> no component uses dangerouslySetInnerHTML', () => {
    const offenders = fs
      .readdirSync('frontend/app', { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.(tsx?|jsx?)$/.test(file))
      .filter((file) => fs.readFileSync(path.join('frontend/app', file), 'utf8').includes('dangerouslySetInnerHTML'));

    expect(offenders).toEqual([]);
  });
});
