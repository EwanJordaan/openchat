import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILE_PATH = path.join(process.cwd(), ".env");

export interface RuntimeEnvSettings {
  database: {
    adapter: "postgres" | "convex";
    databaseUrl: string;
  };
  auth: {
    defaultProviderName: string;
    clockSkewSeconds: number;
    localEnabled: boolean;
    localCookieName: string;
    localSessionMaxAgeSeconds: number;
    sessionSecureCookiesMode: "auto" | "true" | "false";
    sessionCookieName: string;
    flowCookieName: string;
    issuersJson: string;
  };
}

export interface RuntimeEnvSettingsUpdate {
  database: {
    adapter: "postgres" | "convex";
    databaseUrl: string;
  };
  auth: {
    defaultProviderName: string;
    clockSkewSeconds: number;
    localEnabled: boolean;
    localCookieName: string;
    localSessionMaxAgeSeconds: number;
    sessionSecureCookiesMode: "auto" | "true" | "false";
    sessionCookieName: string;
    flowCookieName: string;
    issuersJson: string;
  };
}

type EnvPatch = Record<string, string | null>;

export function getRuntimeEnvSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeEnvSettings {
  return {
    database: {
      adapter: parseDbAdapter(env.BACKEND_DB_ADAPTER),
      databaseUrl: env.DATABASE_URL?.trim() ?? "",
    },
    auth: {
      defaultProviderName: env.BACKEND_AUTH_DEFAULT_PROVIDER?.trim() ?? "",
      clockSkewSeconds: parseClockSkewSeconds(env.BACKEND_AUTH_CLOCK_SKEW_SECONDS),
      localEnabled: parseBooleanFlag(env.BACKEND_AUTH_LOCAL_ENABLED, false),
      localCookieName: env.BACKEND_AUTH_LOCAL_COOKIE_NAME?.trim() || "openchat_local_session",
      localSessionMaxAgeSeconds: parseLocalAuthSessionMaxAgeSeconds(
        env.BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS,
      ),
      sessionSecureCookiesMode: parseSessionSecureCookiesMode(env.BACKEND_SESSION_SECURE_COOKIES),
      sessionCookieName: env.BACKEND_SESSION_COOKIE_NAME?.trim() || "openchat_session",
      flowCookieName: env.BACKEND_AUTH_FLOW_COOKIE_NAME?.trim() || "openchat_auth_flow",
      issuersJson: formatIssuersJson(env.BACKEND_AUTH_ISSUERS),
    },
  };
}

export async function updateRuntimeEnvSettings(
  input: RuntimeEnvSettingsUpdate,
): Promise<{ filePath: string; patch: EnvPatch }> {
  const normalizedIssuers = parseIssuersJsonArray(input.auth.issuersJson);

  assertSingleAuthMode({
    localEnabled: input.auth.localEnabled,
    issuers: normalizedIssuers,
    defaultProviderName: input.auth.defaultProviderName,
  });

  const issuersJson = normalizedIssuers.length > 0 ? JSON.stringify(normalizedIssuers) : null;

  const patch: EnvPatch = {
    BACKEND_DB_ADAPTER: input.database.adapter,
    DATABASE_URL: input.database.databaseUrl.trim() || null,
    BACKEND_AUTH_DEFAULT_PROVIDER: input.auth.defaultProviderName.trim() || null,
    BACKEND_AUTH_CLOCK_SKEW_SECONDS: String(input.auth.clockSkewSeconds),
    BACKEND_AUTH_LOCAL_ENABLED: input.auth.localEnabled ? "true" : "false",
    BACKEND_AUTH_LOCAL_COOKIE_NAME: input.auth.localCookieName.trim(),
    BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS: String(input.auth.localSessionMaxAgeSeconds),
    BACKEND_SESSION_SECURE_COOKIES:
      input.auth.sessionSecureCookiesMode === "auto" ? null : input.auth.sessionSecureCookiesMode,
    BACKEND_SESSION_COOKIE_NAME: input.auth.sessionCookieName.trim(),
    BACKEND_AUTH_FLOW_COOKIE_NAME: input.auth.flowCookieName.trim(),
    BACKEND_AUTH_ISSUERS: issuersJson,
  };

  await applyEnvPatch(patch);

  return {
    filePath: ENV_FILE_PATH,
    patch,
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

  return fallback;
}

function parseLocalAuthSessionMaxAgeSeconds(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    return 60 * 60 * 24 * 30;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 300 || parsed > 60 * 60 * 24 * 90) {
    return 60 * 60 * 24 * 30;
  }

  return parsed;
}

export function applyRuntimeEnvPatchToProcessEnv(patch: EnvPatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function parseDbAdapter(raw: string | undefined): "postgres" | "convex" {
  const value = raw?.trim().toLowerCase();
  if (value === "convex") {
    return "convex";
  }

  return "postgres";
}

function parseClockSkewSeconds(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    return 60;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 300) {
    return 60;
  }

  return parsed;
}

function parseSessionSecureCookiesMode(raw: string | undefined): "auto" | "true" | "false" {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return "auto";
  }

  if (value === "true" || value === "1") {
    return "true";
  }

  if (value === "false" || value === "0") {
    return "false";
  }

  return "auto";
}

function formatIssuersJson(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    return "";
  }

  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function parseIssuersJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("BACKEND_AUTH_ISSUERS must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("BACKEND_AUTH_ISSUERS must be a JSON array");
  }

  return parsed;
}

function assertSingleAuthMode(input: {
  localEnabled: boolean;
  issuers: unknown[];
  defaultProviderName: string;
}): void {
  const issuersCount = input.issuers.length;
  const defaultProviderName = input.defaultProviderName.trim();

  if (input.localEnabled && issuersCount > 0) {
    throw new Error(
      "Only one authentication mode can be active. Disable local auth or clear auth issuers JSON.",
    );
  }

  if (issuersCount > 1) {
    throw new Error("Only one OIDC issuer is supported at a time in auth issuers JSON.");
  }

  if (input.localEnabled && defaultProviderName.length > 0) {
    throw new Error("Default provider must be empty when local auth is enabled.");
  }

  if (!input.localEnabled && issuersCount === 0 && defaultProviderName.length > 0) {
    throw new Error("Default provider requires a configured auth issuer.");
  }

  if (issuersCount === 1 && defaultProviderName.length > 0) {
    const configuredName = readIssuerName(input.issuers[0]);
    if (configuredName && configuredName !== defaultProviderName) {
      throw new Error("Default provider must match the configured issuer name.");
    }
  }
}

function readIssuerName(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const issuer = value as { name?: unknown };
  return typeof issuer.name === "string" ? issuer.name : null;
}

async function applyEnvPatch(patch: EnvPatch): Promise<void> {
  const existingRaw = existsSync(ENV_FILE_PATH) ? await readFile(ENV_FILE_PATH, "utf8") : "";
  const newline = existingRaw.includes("\r\n") ? "\r\n" : "\n";
  const lines = existingRaw.length > 0 ? existingRaw.split(/\r?\n/) : [];
  const seenKeys = new Set<string>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];
    if (!(key in patch)) {
      nextLines.push(line);
      continue;
    }

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);

    const nextValue = patch[key];
    if (nextValue === null) {
      continue;
    }

    nextLines.push(`${key}=${serializeEnvValue(nextValue)}`);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (seenKeys.has(key) || value === null) {
      continue;
    }

    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  const sanitizedLines = trimTrailingEmptyLines(nextLines);
  const nextRaw = `${sanitizedLines.join(newline)}${newline}`;
  await writeFile(ENV_FILE_PATH, nextRaw, "utf8");
}

function serializeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@$-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  let endIndex = lines.length;
  while (endIndex > 0 && lines[endIndex - 1].trim().length === 0) {
    endIndex -= 1;
  }

  if (endIndex === 0) {
    return [];
  }

  return lines.slice(0, endIndex);
}
