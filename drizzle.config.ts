import { defineConfig } from "drizzle-kit";

function resolveDbUrl() {
  const direct = process.env.DATABASE_URL;
  if (direct && direct !== "postgres://postgres:postgres@localhost:5432/openchat") return direct;
  if (process.env.DATABASE_PRIVATE_URL) return process.env.DATABASE_PRIVATE_URL;
  if (process.env.DATABASE_PUBLIC_URL) return process.env.DATABASE_PUBLIC_URL;
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const pass = process.env.PGPASSWORD;
  if (host && user && pass) {
    const port = process.env.PGPORT ?? "5432";
    const db = process.env.PGDATABASE ?? "railway";
    const sslParam = host.includes("railway.internal") || host === "localhost" ? "" : "?sslmode=require";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}${sslParam}`;
  }
  return direct || "postgres://postgres:postgres@localhost:5432/openchat";
}

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  // Keep supabase/migrations for legacy compatibility; new Railway migrations also go here
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDbUrl(),
  },
  verbose: true,
  strict: true,
});
