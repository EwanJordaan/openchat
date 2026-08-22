import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
  // Railway: standalone output reduces image size & speeds cold start
  output: process.env.RAILWAY_ENVIRONMENT ? "standalone" : undefined,
  // Allow Railway healthcheck to reach /api/health quickly
  experimental: {
    // keep for future optimizePackageImports if needed
  },
};

export default nextConfig;
