// frontend/next.config.ts
import type { NextConfig } from 'next';
import path from 'node:path'; // Native module to resolve paths
import { buildSecurityHeaders } from './security-headers'; // CSP and the other security headers (issue #42)

// The Maestro API origin, the only other origin the browser may call (connect-src in the CSP).
// It comes from the same variable the pages use to build their fetch URLs.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').origin;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // =========================================================================
  // 🛡️ SECURITY HEADERS (CWE-79 / CWE-1021)
  // =========================================================================
  // Sent on every route ('/:path*'): a static Content Security Policy, clickjacking protection,
  // nosniff, a strict Referrer-Policy and a Permissions-Policy. See security-headers.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          isDev: process.env.NODE_ENV === 'development',
          apiOrigin
        })
      }
    ];
  },

  // =========================================================================
  // ⚙️ TURBOPACK MONOREPO ROOT REMEDIATION
  // =========================================================================
  // Explicitly binds the compiler's file watcher scope strictly inside the
  // frontend directory context to prevent multi-lockfile root inference collisions.
  turbopack: {
    root: path.resolve(__dirname), // Forces absolute path binding to current folder
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css'
      }
    }
  }
};

export default nextConfig;
