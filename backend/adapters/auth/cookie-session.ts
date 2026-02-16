import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { decodeJwt } from "jose";

import type { AuthFlowMode } from "@/backend/adapters/auth/types";
import type { BackendConfig } from "@/backend/composition/config";

export interface BrowserSession {
  accessToken: string;
  providerName: string;
  expiresAt: string;
}

export interface AuthFlowSession {
  providerName: string;
  mode: AuthFlowMode;
  returnTo: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: string;
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

interface SignedValue<T> {
  v: 1;
  data: T;
}

const DEFAULT_SAME_SITE: SameSite = "Lax";
const MIN_SESSION_MAX_AGE_SECONDS = 60;
const MAX_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const FLOW_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export function readSessionFromCookie(
  cookieHeader: string | null,
  config: BackendConfig["session"],
): BrowserSession | null {
  if (!config.secret) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[config.cookieName];
  if (!raw) {
    return null;
  }

  const parsed = decodeSignedValue<BrowserSession>(raw, config.secret);
  if (!parsed) {
    return null;
  }

  if (!parsed.expiresAt) {
    return null;
  }

  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    return null;
  }

  return parsed;
}

export function readAuthFlowFromCookie(
  cookieHeader: string | null,
  config: BackendConfig["session"],
): AuthFlowSession | null {
  if (!config.secret) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[config.flowCookieName];
  if (!raw) {
    return null;
  }

  const parsed = decodeSignedValue<AuthFlowSession>(raw, config.secret);
  if (!parsed) {
    return null;
  }

  const createdAtMs = Date.parse(parsed.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  if (Date.now() - createdAtMs > FLOW_COOKIE_MAX_AGE_SECONDS * 1000) {
    return null;
  }

  return parsed;
}

export function createSessionCookie(
  session: BrowserSession,
  config: BackendConfig["session"],
): string {
  const secret = requireSessionSecret(config.secret);
  const value = encodeSignedValue(session, secret);
  const ttlSeconds = resolveSessionTtlSeconds(session.accessToken, session.expiresAt);

  return serializeCookie(config.cookieName, value, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: ttlSeconds,
  });
}

export function createClearedSessionCookie(config: BackendConfig["session"]): string {
  return serializeCookie(config.cookieName, "", {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export function createAuthFlowCookie(
  flow: AuthFlowSession,
  config: BackendConfig["session"],
): string {
  const secret = requireSessionSecret(config.secret);
  const value = encodeSignedValue(flow, secret);

  return serializeCookie(config.flowCookieName, value, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
  });
}

export function createClearedAuthFlowCookie(config: BackendConfig["session"]): string {
  return serializeCookie(config.flowCookieName, "", {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: DEFAULT_SAME_SITE,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export function createPkceCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createStateValue(): string {
  return randomBytes(32).toString("base64url");
}

export function createNonceValue(): string {
  return randomBytes(32).toString("base64url");
}

export function createCodeChallengeS256(codeVerifier: string): string {
  return createSha256Base64Url(codeVerifier);
}

function createSha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
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
    const payloadJson = Buffer.from(payloadPart, "base64url").toString("utf8");
    parsed = JSON.parse(payloadJson);
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

function requireSessionSecret(secret: string | undefined): string {
  if (!secret || secret.trim().length < 32) {
    throw new Error("BACKEND_SESSION_SECRET is required and must be at least 32 characters");
  }

  return secret;
}

function resolveSessionTtlSeconds(accessToken: string, expiresAtIso: string): number {
  const parsedExpiresAt = Date.parse(expiresAtIso);
  if (Number.isFinite(parsedExpiresAt)) {
    const seconds = Math.floor((parsedExpiresAt - Date.now()) / 1000);
    if (seconds >= MIN_SESSION_MAX_AGE_SECONDS) {
      return Math.min(seconds, MAX_SESSION_MAX_AGE_SECONDS);
    }
  }

  try {
    const payload = decodeJwt(accessToken);
    if (typeof payload.exp === "number") {
      const seconds = Math.floor(payload.exp - Date.now() / 1000);
      if (seconds >= MIN_SESSION_MAX_AGE_SECONDS) {
        return Math.min(seconds, MAX_SESSION_MAX_AGE_SECONDS);
      }
    }
  } catch {
    // Ignore decode failures and use fallback.
  }

  return MIN_SESSION_MAX_AGE_SECONDS;
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const entries = cookieHeader.split(";");
  const cookies: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
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
