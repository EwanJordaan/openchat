import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
  // Keep regular output for `next start`; use `node .next/standalone/server.js` only if you switch to standalone
  // Railway Nixpacks handles `next start` correctly without standalone.
  experimental: {
    // keep for future optimizePackageImports if needed
  },
};

export default nextConfig;
