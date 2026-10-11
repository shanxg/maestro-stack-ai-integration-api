// frontend/next.config.ts
import type { NextConfig } from "next";
import path from "node:path"; // Native module to resolve paths

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  
  // =========================================================================
  // ⚙️ TURBOPACK MONOREPO ROOT REMEDIATION
  // =========================================================================
  // Explicitly binds the compiler's file watcher scope strictly inside the 
  // frontend directory context to prevent multi-lockfile root inference collisions.
  turbopack: {
    root: path.resolve(__dirname), // Forces absolute path binding to current folder
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
