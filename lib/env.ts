import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  // Allow build-time fallback so `next build` collecting page data doesn't fail when Railway build env hasn't injected secrets yet
  // At runtime, Railway will inject the real secret; placeholder is rejected in production isProduction check below if still present
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default("placeholder-for-build-please-set-real-BETTER_AUTH_SECRET-32+chars"),
  DATABASE_PROVIDER: z.enum(["postgres", "supabase", "neon", "mysql", "railway"]).default("postgres"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/openchat"),
  // Railway injects these individually when linking Postgres; fallback if DATABASE_URL missing
  PGHOST: z.string().optional(),
  PGPORT: z.coerce.number().optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().optional(),
  DATABASE_PUBLIC_URL: z.string().optional(),
  DATABASE_PRIVATE_URL: z.string().optional(),
  // Railway / deploy
  PORT: z.coerce.number().optional(),
  RAILWAY_ENVIRONMENT: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("openchat_session"),
  GUEST_COOKIE_NAME: z.string().default("openchat_guest"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_BLOCK_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_REGISTER_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_REGISTER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AUTH_REGISTER_BLOCK_MS: z.coerce.number().int().positive().default(20 * 60 * 1000),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  ADMIN_SEED_EMAIL: z.string().default(""),
  ADMIN_SEED_PASSWORD: z.string().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  VECTOR_DIMS: z.coerce.number().int().positive().default(1536),
  EMBED_PROVIDER: z.enum(["openai", "voyage", "local"]).default("openai"),
  EMBED_MODEL: z.string().default("text-embedding-3-small"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_BUCKET: z.string().default("openchat-uploads"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_REGION: z.string().default("us-east-1"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(12),
  // Sandboxed runners (Railway second service)
  RUNNER_URL: z.string().optional(),
  RUNNER_TOKEN: z.string().optional(),
  RUNNER_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export const env = envSchema.parse(process.env);

export const adminEmailSet = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const adminSeedEmail =
  env.ADMIN_SEED_EMAIL.trim().toLowerCase() || Array.from(adminEmailSet)[0] || "admin@example.com";

export const adminSeedPassword = env.ADMIN_SEED_PASSWORD.trim();

export const isProduction = env.NODE_ENV === "production";

// ── Database URL resolution — Railway compatible ──────────────────────────
const DEFAULT_DB_URL = "postgres://postgres:postgres@localhost:5432/openchat";

export function resolveDatabaseUrl(): string {
  // Explicit non-default DATABASE_URL always wins (Railway linked value or user-set)
  if (env.DATABASE_URL && env.DATABASE_URL !== DEFAULT_DB_URL) {
    return env.DATABASE_URL;
  }
  // Check private/public URL variants Railway may inject under different names
  if (env.DATABASE_PRIVATE_URL) return env.DATABASE_PRIVATE_URL;
  if (env.DATABASE_PUBLIC_URL) return env.DATABASE_PUBLIC_URL;
  // Construct from individual PG* vars (Railway injects these alongside DATABASE_URL)
  if (env.PGHOST && env.PGUSER && env.PGPASSWORD) {
    const host = env.PGHOST;
    const port = env.PGPORT ?? 5432;
    const user = encodeURIComponent(env.PGUSER);
    const pass = encodeURIComponent(env.PGPASSWORD);
    const db = env.PGDATABASE ?? "railway";
    const sslParam = host.includes("railway.internal") || host === "localhost" || host === "127.0.0.1" ? "" : "?sslmode=require";
    return `postgresql://${user}:${pass}@${host}:${port}/${db}${sslParam}`;
  }
  return env.DATABASE_URL;
}

export function isRailwayEnvironment(): boolean {
  return Boolean(env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT || env.DATABASE_URL.includes("railway.internal") || env.DATABASE_URL.includes("proxy.rlwy.net"));
}

export const normalizedDatabaseProvider = ((): "postgres" | "supabase" | "neon" | "mysql" | "railway" => {
  return env.DATABASE_PROVIDER as "postgres" | "supabase" | "neon" | "mysql" | "railway";
})();

export const effectivePostgresProvider = normalizedDatabaseProvider === "railway" ? "postgres" : normalizedDatabaseProvider;
