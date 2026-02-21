import { z } from "zod";

import type { AuthIssuerConfig } from "@/backend/adapters/auth/types";
import { getEffectiveOpenChatConfigSync } from "@/backend/composition/site-settings-store";
import type { ModelProviderId } from "@/shared/model-providers";
import type {
  OpenRouterPolicyConfig,
  OpenRouterRateLimitsConfig,
} from "@/openchat.config";

const envSchema = z.object({
  BACKEND_DB_ADAPTER: z.enum(["postgres", "convex"]).optional(),
  DATABASE_URL: z.string().optional(),
  BACKEND_AUTH_ISSUERS: z.string().optional(),
  BACKEND_AUTH_DEFAULT_PROVIDER: z.string().optional(),
  BACKEND_AUTH_CLOCK_SKEW_SECONDS: z.string().optional(),
  BACKEND_AUTH_LOCAL_ENABLED: z.string().optional(),
  BACKEND_AUTH_LOCAL_COOKIE_NAME: z.string().optional(),
  BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS: z.string().optional(),
  BACKEND_SESSION_SECRET: z.string().optional(),
  BACKEND_SESSION_COOKIE_NAME: z.string().optional(),
  BACKEND_AUTH_FLOW_COOKIE_NAME: z.string().optional(),
  BACKEND_SESSION_SECURE_COOKIES: z.string().optional(),
  BACKEND_ADMIN_COOKIE_NAME: z.string().optional(),
  BACKEND_ADMIN_PASSWORD_HASH: z.string().optional(),
  BACKEND_ADMIN_SETUP_PASSWORD: z.string().optional(),
  BACKEND_ADMIN_REQUIRED_EMAIL: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

const DEFAULT_ADMIN_SETUP_PASSWORD = "admin";

const kvParamsSchema = z.record(z.string(), z.string());

const issuerSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().url(),
  audience: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  jwksUri: z.string().url(),
  tokenUse: z.enum(["access", "id", "any"]).default("access"),
  algorithms: z.array(z.string().min(1)).optional(),
  requiredScopes: z.array(z.string().min(1)).optional(),
  claimMapping: z
    .object({
      email: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      orgId: z.string().min(1).optional(),
      roles: z.string().min(1).optional(),
      permissions: z.string().min(1).optional(),
    })
    .partial()
    .optional(),
  oidc: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1).optional(),
      redirectUri: z.string().url(),
      scopes: z.array(z.string().min(1)).min(1).optional(),
      authorizationParams: kvParamsSchema.optional(),
      loginParams: kvParamsSchema.optional(),
      registerParams: kvParamsSchema.optional(),
      postLogoutRedirectUri: z.string().url().optional(),
    })
    .optional(),
});

export interface BackendConfig {
  db: {
    adapter: "postgres" | "convex";
    databaseUrl?: string;
  };
  auth: {
    clockSkewSeconds: number;
    issuers: AuthIssuerConfig[];
    defaultProviderName?: string;
    local: {
      enabled: boolean;
      cookieName: string;
      sessionMaxAgeSeconds: number;
    };
  };
  session: {
    secret?: string;
    cookieName: string;
    flowCookieName: string;
    secureCookies: boolean;
  };
  ai: {
    defaultModelProvider: ModelProviderId;
    allowUserModelProviderSelection: boolean;
    openrouter: OpenRouterPolicyConfig;
  };
  adminSetup: {
    password?: string;
    requiredEmail?: string;
  };
  adminAuth: {
    cookieName: string;
    passwordHash?: string;
  };
}

export function loadBackendConfig(): BackendConfig {
  const env = envSchema.parse(process.env);
  const siteConfig = getEffectiveOpenChatConfigSync();

  const dbAdapter = env.BACKEND_DB_ADAPTER ?? "postgres";
  const clockSkewSeconds = parseClockSkew(env.BACKEND_AUTH_CLOCK_SKEW_SECONDS);
  const issuers = parseIssuerConfig(env.BACKEND_AUTH_ISSUERS);
  const defaultProviderName = parseDefaultProviderName(env.BACKEND_AUTH_DEFAULT_PROVIDER);
  const localAuthEnabled = parseBooleanFlag(env.BACKEND_AUTH_LOCAL_ENABLED, false);
  const localAuthCookieName = parseCookieName(
    env.BACKEND_AUTH_LOCAL_COOKIE_NAME,
    "openchat_local_session",
  );
  const localAuthSessionMaxAgeSeconds = parseLocalAuthSessionMaxAgeSeconds(
    env.BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS,
  );
  const sessionCookieName = parseCookieName(env.BACKEND_SESSION_COOKIE_NAME, "openchat_session");
  const flowCookieName = parseCookieName(env.BACKEND_AUTH_FLOW_COOKIE_NAME, "openchat_auth_flow");
  const secureCookies = parseSecureCookies(env.BACKEND_SESSION_SECURE_COOKIES, env.NODE_ENV);
  const adminCookieName = parseCookieName(env.BACKEND_ADMIN_COOKIE_NAME, "openchat_admin_session");
  const adminPasswordHash = parseAdminPasswordHash(env.BACKEND_ADMIN_PASSWORD_HASH);
  const adminSetupPassword = parseAdminSetupPassword(env.BACKEND_ADMIN_SETUP_PASSWORD);
  const adminRequiredEmail = parseRequiredAdminEmail(env.BACKEND_ADMIN_REQUIRED_EMAIL);

  if (dbAdapter === "postgres" && !env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required when BACKEND_DB_ADAPTER is 'postgres'. Set BACKEND_DB_ADAPTER='convex' to bypass Postgres wiring.",
    );
  }

  return {
    db: {
      adapter: dbAdapter,
      databaseUrl: env.DATABASE_URL,
    },
    auth: {
      clockSkewSeconds,
      issuers,
      defaultProviderName,
      local: {
        enabled: localAuthEnabled,
        cookieName: localAuthCookieName,
        sessionMaxAgeSeconds: localAuthSessionMaxAgeSeconds,
      },
    },
    session: {
      secret: env.BACKEND_SESSION_SECRET,
      cookieName: sessionCookieName,
      flowCookieName,
      secureCookies,
    },
    ai: {
      defaultModelProvider: siteConfig.ai.defaultModelProvider,
      allowUserModelProviderSelection: siteConfig.ai.allowUserModelProviderSelection,
      openrouter: {
        allowedModels: [...siteConfig.ai.openrouter.allowedModels],
        rateLimits: normalizeOpenRouterRateLimits(siteConfig.ai.openrouter.rateLimits),
      },
    },
    adminSetup: {
      password: adminSetupPassword,
      requiredEmail: adminRequiredEmail,
    },
    adminAuth: {
      cookieName: adminCookieName,
      passwordHash: adminPasswordHash,
    },
  };
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error("Boolean flags must use true/false/1/0");
}

function parseLocalAuthSessionMaxAgeSeconds(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    return 60 * 60 * 24 * 30;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 300 || parsed > 60 * 60 * 24 * 90) {
    throw new Error("BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS must be an integer between 300 and 7776000");
  }

  return parsed;
}

function normalizeOpenRouterRateLimits(input: OpenRouterRateLimitsConfig): OpenRouterRateLimitsConfig {
  return {
    guestRequestsPerDay: normalizeDailyLimit(input.guestRequestsPerDay),
    memberRequestsPerDay: normalizeDailyLimit(input.memberRequestsPerDay),
    adminRequestsPerDay: normalizeDailyLimit(input.adminRequestsPerDay),
  };
}

function normalizeDailyLimit(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("OpenRouter rate limits must be integers between 0 and 1000000");
  }

  return value;
}

function parseDefaultProviderName(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("BACKEND_AUTH_DEFAULT_PROVIDER may only contain letters, numbers, underscores, and dashes");
  }

  return value;
}

function parseIssuerConfig(issuerJson: string | undefined): AuthIssuerConfig[] {
  if (!issuerJson || issuerJson.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(issuerJson);
  } catch {
    throw new Error("BACKEND_AUTH_ISSUERS must be valid JSON");
  }

  const issuers = z.array(issuerSchema).parse(parsed);
  return issuers;
}

function parseClockSkew(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) {
    return 60;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 300) {
    throw new Error("BACKEND_AUTH_CLOCK_SKEW_SECONDS must be an integer between 0 and 300");
  }

  return parsed;
}

function parseCookieName(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }

  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)) {
    throw new Error(`Cookie name contains invalid characters: ${value}`);
  }

  return value;
}

function parseSecureCookies(raw: string | undefined, nodeEnv: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return nodeEnv === "production";
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error("BACKEND_SESSION_SECURE_COOKIES must be a boolean string (true/false/1/0)");
}

function parseAdminSetupPassword(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return DEFAULT_ADMIN_SETUP_PASSWORD;
  }

  return value;
}

function parseAdminPasswordHash(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  return value;
}

function parseRequiredAdminEmail(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }

  const parsedEmail = z.string().email().safeParse(value);
  if (!parsedEmail.success) {
    throw new Error("BACKEND_ADMIN_REQUIRED_EMAIL must be a valid email address when set");
  }

  return parsedEmail.data;
}
