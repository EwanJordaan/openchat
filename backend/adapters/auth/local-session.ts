import { createHmac, timingSafeEqual } from "node:crypto";

import type { BackendConfig } from "@/backend/composition/config";

import { parseCookieHeader } from "@/backend/adapters/auth/cookie-session";

export interface LocalAuthCookieSession {
  sessionId: string;
  expiresAt: string;
}

interface SignedValue<T> {
  v: 1;
  data: T;
}

type SameSite = "Strict" | "Lax" | "None";

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
  path?: string;
  maxAge?: number;
  expires?: Date;
}

const DEFAULT_SAME_SITE: SameSite = "Lax";

export function readLocalAuthSessionFromCookie(
  cookieHeader: string | null,
  config: BackendConfig,
): LocalAuthCookieSession | null {
  const secret = resolveSessionSecret(config);
  if (!secret || !config.auth.local.enabled) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const rawValue = cookies[config.auth.local.cookieName];
  if (!rawValue) {
    return null;
  }

  const parsed = decodeSignedValue<LocalAuthCookieSession>(rawValue, secret);
  if (!parsed || !parsed.sessionId || !parsed.expiresAt) {
    return null;
  }

  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    return null;
  }

  return parsed;
}

export function createLocalAuthSessionCookie(
  session: LocalAuthCookieSession,
  config: BackendConfig,
): string {
  const secret = requireSessionSecret(config);
  const value = encodeSignedValue(session, secret);

  const expiresAtMs = Date.parse(session.expiresAt);
  const ttlSeconds = Number.isFinite(expiresAtMs)
    ? Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000))
    : config.auth.local.sessionMaxAgeSeconds;

  return serializeCookie(config.auth.local.cookieName, value, {
    httpOnly: true,
    secure: config.session.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: ttlSeconds,
  });
}

export function createClearedLocalAuthSessionCookie(config: BackendConfig): string {
  return serializeCookie(config.auth.local.cookieName, "", {
    httpOnly: true,
    secure: config.session.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

function requireSessionSecret(config: BackendConfig): string {
  const secret = resolveSessionSecret(config);
  if (!secret) {
    throw new Error("BACKEND_SESSION_SECRET is required and must be at least 32 characters");
  }

  return secret;
}

function resolveSessionSecret(config: BackendConfig): string | null {
  const secret = config.session.secret?.trim();
  if (!secret || secret.length < 32) {
    return null;
  }

  return secret;
}

function encodeSignedValue<T>(data: T, secret: string): string {
  const payload = JSON.stringify({
    v: 1,
    data,
  } satisfies SignedValue<T>);

  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createSignature(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function decodeSignedValue<T>(rawValue: string, secret: string): T | null {
  const dotIndex = rawValue.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }

  const payloadPart = rawValue.slice(0, dotIndex);
  const signaturePart = rawValue.slice(dotIndex + 1);
  if (!signaturePart) {
    return null;
  }

  const expectedSignature = Buffer.from(createSignature(payloadPart, secret), "base64url");

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signaturePart, "base64url");
  } catch {
    return null;
  }

  if (expectedSignature.length !== providedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const parsedValue = parsed as Partial<SignedValue<T>>;
  if (parsedValue.v !== 1 || parsedValue.data === undefined) {
    return null;
  }

  return parsedValue.data as T;
}

function createSignature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const attributes = [`${name}=${encodeURIComponent(value)}`];
  attributes.push(`Path=${options.path ?? "/"}`);

  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires) {
    attributes.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }

  if (options.secure) {
    attributes.push("Secure");
  }

  attributes.push(`SameSite=${options.sameSite ?? DEFAULT_SAME_SITE}`);

  return attributes.join("; ");
}
