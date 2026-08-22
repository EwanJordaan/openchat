import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/openchat",
  },
  verbose: true,
  strict: true,
});
