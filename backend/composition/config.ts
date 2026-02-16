import { z } from "zod";

import type { AuthIssuerConfig } from "@/backend/adapters/auth/types";

const envSchema = z.object({
  BACKEND_DB_ADAPTER: z.enum(["postgres", "convex"]).optional(),
  DATABASE_URL: z.string().optional(),
  BACKEND_AUTH_ISSUERS: z.string().optional(),
  BACKEND_AUTH_CLOCK_SKEW_SECONDS: z.string().optional(),
  BACKEND_SESSION_SECRET: z.string().optional(),
  BACKEND_SESSION_COOKIE_NAME: z.string().optional(),
  BACKEND_AUTH_FLOW_COOKIE_NAME: z.string().optional(),
  BACKEND_SESSION_SECURE_COOKIES: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

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
  };
  session: {
    secret?: string;
    cookieName: string;
    flowCookieName: string;
    secureCookies: boolean;
  };
}

export function loadBackendConfig(): BackendConfig {
  const env = envSchema.parse(process.env);

  const dbAdapter = env.BACKEND_DB_ADAPTER ?? "postgres";
  const clockSkewSeconds = parseClockSkew(env.BACKEND_AUTH_CLOCK_SKEW_SECONDS);
  const issuers = parseIssuerConfig(env.BACKEND_AUTH_ISSUERS);
  const sessionCookieName = parseCookieName(env.BACKEND_SESSION_COOKIE_NAME, "openchat_session");
  const flowCookieName = parseCookieName(env.BACKEND_AUTH_FLOW_COOKIE_NAME, "openchat_auth_flow");
  const secureCookies = parseSecureCookies(env.BACKEND_SESSION_SECURE_COOKIES, env.NODE_ENV);

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
    },
    session: {
      secret: env.BACKEND_SESSION_SECRET,
      cookieName: sessionCookieName,
      flowCookieName,
      secureCookies,
    },
  };
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
