import { Pool } from "pg";

import {
  type ProviderApiKeysStatus,
  getProviderApiKeysStatusFromEnv,
} from "@/backend/composition/provider-api-keys-env";
import {
  type RuntimeEnvSettings,
  getRuntimeEnvSettingsFromEnv,
} from "@/backend/composition/runtime-env-settings";

type DashboardStatusLevel = "ready" | "warning" | "error";

type AuthMode = "none" | "local" | "oidc" | "invalid";

interface IssuerDraft {
  name: string;
  issuer: string;
  audience: string | string[];
  jwksUri: string;
}

export interface DashboardStatusItem {
  level: DashboardStatusLevel;
  message: string;
}

export interface DashboardSummary {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export interface AdminDashboardStatus {
  runtimeSettings: RuntimeEnvSettings;
  apiKeys: ProviderApiKeysStatus;
  authMode: AuthMode;
  checks: {
    database: DashboardStatusItem;
    auth: DashboardStatusItem;
    sessionSecret: DashboardStatusItem;
  };
  summary: DashboardSummary;
}

export async function getAdminDashboardStatus(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdminDashboardStatus> {
  const runtimeSettings = getRuntimeEnvSettingsFromEnv(env);
  const apiKeys = getProviderApiKeysStatusFromEnv(env);

  const authValidation = validateAuthMode(runtimeSettings);
  const databaseStatus = await getDatabaseStatus(runtimeSettings);
  const sessionSecretStatus = getSessionSecretStatus(env.BACKEND_SESSION_SECRET, authValidation.mode);

  const blockers: string[] = [];
  const warnings: string[] = [];

  collectStatusMessages(databaseStatus, blockers, warnings);
  collectStatusMessages(authValidation.status, blockers, warnings);
  collectStatusMessages(sessionSecretStatus, blockers, warnings);

  return {
    runtimeSettings,
    apiKeys,
    authMode: authValidation.mode,
    checks: {
      database: databaseStatus,
      auth: authValidation.status,
      sessionSecret: sessionSecretStatus,
    },
    summary: {
      ready: blockers.length === 0,
      blockers,
      warnings,
    },
  };
}

function collectStatusMessages(
  status: DashboardStatusItem,
  blockers: string[],
  warnings: string[],
): void {
  if (status.level === "error") {
    blockers.push(status.message);
    return;
  }

  if (status.level === "warning") {
    warnings.push(status.message);
  }
}

function validateAuthMode(runtimeSettings: RuntimeEnvSettings): {
  mode: AuthMode;
  status: DashboardStatusItem;
} {
  const issuers = parseIssuers(runtimeSettings.auth.issuersJson);
  if (runtimeSettings.auth.localEnabled && issuers.length > 0) {
    return {
      mode: "invalid",
      status: {
        level: "error",
        message:
          "Auth mode conflict: disable local auth or clear OIDC issuers. Only one auth mode can be active.",
      },
    };
  }

  if (issuers.length > 1) {
    return {
      mode: "invalid",
      status: {
        level: "error",
        message: "Only one OIDC issuer is supported at a time.",
      },
    };
  }

  if (runtimeSettings.auth.localEnabled) {
    return {
      mode: "local",
      status: {
        level: "ready",
        message: "Local credentials auth is active.",
      },
    };
  }

  if (issuers.length === 1) {
    const [issuer] = issuers;
    if (!issuer) {
      return {
        mode: "invalid",
        status: {
          level: "error",
          message: "OIDC issuer parsing failed.",
        },
      };
    }

    const requiredFieldsPresent =
      issuer.name.length > 0 &&
      issuer.issuer.length > 0 &&
      issuer.jwksUri.length > 0 &&
      (typeof issuer.audience === "string" || Array.isArray(issuer.audience));

    if (!requiredFieldsPresent) {
      return {
        mode: "invalid",
        status: {
          level: "error",
          message: "OIDC issuer is missing one or more required fields (name, issuer, audience, jwksUri).",
        },
      };
    }

    const defaultProviderName = runtimeSettings.auth.defaultProviderName.trim();
    if (defaultProviderName.length > 0 && defaultProviderName !== issuer.name) {
      return {
        mode: "invalid",
        status: {
          level: "error",
          message: "Default provider must match the configured OIDC issuer name.",
        },
      };
    }

    return {
      mode: "oidc",
      status: {
        level: "ready",
        message: `OIDC auth is active (${issuer.name}).`,
      },
    };
  }

  return {
    mode: "none",
    status: {
      level: "warning",
      message: "No app auth mode is configured yet.",
    },
  };
}

function parseIssuers(rawIssuersJson: string): IssuerDraft[] {
  const trimmed = rawIssuersJson.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => {
        const issuer = entry as Partial<IssuerDraft>;

        return {
          name: typeof issuer.name === "string" ? issuer.name : "",
          issuer: typeof issuer.issuer === "string" ? issuer.issuer : "",
          audience:
            typeof issuer.audience === "string" || Array.isArray(issuer.audience)
              ? issuer.audience
              : "",
          jwksUri: typeof issuer.jwksUri === "string" ? issuer.jwksUri : "",
        };
      });
  } catch {
    return [];
  }
}

async function getDatabaseStatus(runtimeSettings: RuntimeEnvSettings): Promise<DashboardStatusItem> {
  if (runtimeSettings.database.adapter === "convex") {
    return {
      level: "ready",
      message: "Database adapter is convex (in-memory fallback).",
    };
  }

  const databaseUrl = runtimeSettings.database.databaseUrl.trim();
  if (!databaseUrl) {
    return {
      level: "error",
      message: "Database adapter is postgres but DATABASE_URL is missing.",
    };
  }

  try {
    await pingPostgres(databaseUrl);
    return {
      level: "ready",
      message: "Postgres connection check passed.",
    };
  } catch (error) {
    return {
      level: "error",
      message: `Postgres connection failed: ${toSafeErrorMessage(error)}`,
    };
  }
}

async function pingPostgres(databaseUrl: string): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 2000,
  });

  try {
    await pool.query("SELECT 1");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function getSessionSecretStatus(
  sessionSecretRaw: string | undefined,
  authMode: AuthMode,
): DashboardStatusItem {
  const sessionSecret = sessionSecretRaw?.trim();
  const hasValidSecret = Boolean(sessionSecret && sessionSecret.length >= 32);

  if (hasValidSecret) {
    return {
      level: "ready",
      message: "Session secret is configured.",
    };
  }

  if (authMode === "none") {
    return {
      level: "warning",
      message: "BACKEND_SESSION_SECRET is not set yet (required for login/register flows).",
    };
  }

  return {
    level: "error",
    message: "BACKEND_SESSION_SECRET is required and must be at least 32 characters.",
  };
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown database connection error";
}
