/**
 * 🛡️ HTTP SECURITY HEADERS FOR THE NEXT.JS APP (CWE-79 / CWE-1021)
 *
 * next.config.ts sends these headers on every route. They are built here, in a plain module,
 * so the API test suite can check them without starting Next.js (tests/frontendSecurity.spec.ts).
 *
 * The Content Security Policy is static (no nonces, no Trusted Types), following the
 * "Without Nonces" setup in the Next.js CSP guide. Next.js still needs inline scripts and styles
 * for hydration, so 'unsafe-inline' stays in script-src and style-src. The policy still blocks:
 * - scripts, styles, images and fonts from any other origin (default-src and the *-src lists);
 * - plugins (object-src 'none') and <base> tag hijacking (base-uri 'self');
 * - forms posting to other origins (form-action 'self');
 * - requests to any origin other than this app and the Maestro API (connect-src);
 * - this app being framed by another site, to prevent clickjacking (frame-ancestors 'none').
 */

export type SecurityHeader = { key: string; value: string };

export function buildSecurityHeaders(options: { isDev: boolean; apiOrigin: string }): SecurityHeader[] {
  const { isDev, apiOrigin } = options;

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' only in development: React's dev tooling needs it, production builds do not.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'", // next/font downloads the Google fonts at build time and serves them from this app
    `connect-src 'self' ${apiOrigin}`, // fetch() may reach only this app and the Maestro API
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // In production, load every http:// subresource over https://. Left out in development,
    // where the API itself runs on plain http://localhost.
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    // Older browsers ignore frame-ancestors; X-Frame-Options gives them the same clickjacking protection.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Never guess a content type: a response is only run as script or style if it says so.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Send only the origin to other sites, never the full URL with its path and query.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The app uses none of these browser features, so no page (or injected script) may ask for them.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
