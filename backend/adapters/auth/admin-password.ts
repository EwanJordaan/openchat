import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";

const HASH_ALGORITHM = "sha512";
const HASH_ITERATIONS = 210_000;
const HASH_KEY_LENGTH = 64;

const HASH_PREFIX = `pbkdf2_${HASH_ALGORITHM}`;

export function getDefaultAdminUsername(): string {
  return DEFAULT_ADMIN_USERNAME;
}

export function isDefaultAdminPasswordConfigured(storedHash: string | undefined): boolean {
  return !storedHash || storedHash.trim().length === 0;
}

export function verifyAdminPassword(password: string, storedHash: string | undefined): boolean {
  if (isDefaultAdminPasswordConfigured(storedHash)) {
    return constantTimeEqual(password, DEFAULT_ADMIN_PASSWORD);
  }

  const parsed = parsePasswordHash(storedHash as string);
  if (!parsed) {
    return false;
  }

  const derived = pbkdf2Sync(
    password,
    Buffer.from(parsed.salt, "base64url"),
    parsed.iterations,
    HASH_KEY_LENGTH,
    HASH_ALGORITHM,
  );

  const expected = Buffer.from(parsed.digest, "base64url");
  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM);

  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export function isValidAdminUsername(username: string): boolean {
  return username.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME;
}

export function validateNewAdminPassword(password: string): string | null {
  const trimmed = password.trim();
  if (trimmed.length < 10) {
    return "New admin password must be at least 10 characters";
  }

  if (trimmed.length > 256) {
    return "New admin password must be 256 characters or fewer";
  }

  if (trimmed === DEFAULT_ADMIN_PASSWORD) {
    return "New admin password must not be the default password";
  }

  return null;
}

interface ParsedPasswordHash {
  iterations: number;
  salt: string;
  digest: string;
}

function parsePasswordHash(raw: string): ParsedPasswordHash | null {
  const segments = raw.split("$");
  if (segments.length !== 4) {
    return null;
  }

  const [prefix, rawIterations, salt, digest] = segments;
  if (prefix !== HASH_PREFIX) {
    return null;
  }

  const iterations = Number(rawIterations);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 500_000) {
    return null;
  }

  if (!salt || !digest) {
    return null;
  }

  return {
    iterations,
    salt,
    digest,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
