import { z } from "zod";

const envSchema = z.object({
  BACKEND_SESSION_SECRET: z.string().optional(),
  BACKEND_SESSION_SECURE_COOKIES: z.string().optional(),
  BACKEND_ADMIN_COOKIE_NAME: z.string().optional(),
  BACKEND_ADMIN_PASSWORD_HASH: z.string().optional(),
  BACKEND_ADMIN_SETUP_PASSWORD: z.string().optional(),
  BACKEND_ADMIN_REQUIRED_EMAIL: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

const DEFAULT_ADMIN_SETUP_PASSWORD = "admin";

export interface AdminRuntimeConfig {
  session: {
    secret?: string;
    secureCookies: boolean;
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

export function loadAdminRuntimeConfig(): AdminRuntimeConfig {
  const env = envSchema.parse(process.env);

  const secureCookies = parseSecureCookies(env.BACKEND_SESSION_SECURE_COOKIES, env.NODE_ENV);
  const adminCookieName = parseCookieName(env.BACKEND_ADMIN_COOKIE_NAME, "openchat_admin_session");
  const adminPasswordHash = parseAdminPasswordHash(env.BACKEND_ADMIN_PASSWORD_HASH);
  const adminSetupPassword = parseAdminSetupPassword(env.BACKEND_ADMIN_SETUP_PASSWORD);
  const adminRequiredEmail = parseRequiredAdminEmail(env.BACKEND_ADMIN_REQUIRED_EMAIL);

  return {
    session: {
      secret: env.BACKEND_SESSION_SECRET,
      secureCookies,
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
