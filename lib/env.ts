import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL: z.string().optional(),
  CF_PAGES: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  DATABASE_PROVIDER: z
    .enum(["postgres", "supabase", "neon", "mysql"])
    .default("postgres"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://postgres:postgres@localhost:5432/openchat"),
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
  OPENAI_BASE_URL_LOCAL: z.string().optional(),
  OPENAI_BASE_URL_VERCEL: z.string().optional(),
  OPENAI_BASE_URL_CLOUDFLARE: z.string().optional(),
  OPENAI_API_KEY_LOCAL: z.string().optional(),
  OPENAI_API_KEY_VERCEL: z.string().optional(),
  OPENAI_API_KEY_CLOUDFLARE: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(12),
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

export type RuntimePlatform = "local" | "vercel" | "cloudflare";

export const runtimePlatform: RuntimePlatform = env.CF_PAGES || env.CLOUDFLARE_ACCOUNT_ID
  ? "cloudflare"
  : env.VERCEL
    ? "vercel"
    : "local";

export function resolveOpenAiEnvironmentConfig() {
  const apiKeyByPlatform =
    runtimePlatform === "cloudflare"
      ? env.OPENAI_API_KEY_CLOUDFLARE
      : runtimePlatform === "vercel"
        ? env.OPENAI_API_KEY_VERCEL
        : env.OPENAI_API_KEY_LOCAL;

  const baseUrlByPlatform =
    runtimePlatform === "cloudflare"
      ? env.OPENAI_BASE_URL_CLOUDFLARE
      : runtimePlatform === "vercel"
        ? env.OPENAI_BASE_URL_VERCEL
        : env.OPENAI_BASE_URL_LOCAL;

  return {
    platform: runtimePlatform,
    apiKey: apiKeyByPlatform || env.OPENAI_API_KEY || "",
    baseUrl: (baseUrlByPlatform || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  };
}
