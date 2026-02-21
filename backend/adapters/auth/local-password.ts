import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "sha512";
const HASH_ITERATIONS = 210_000;
const HASH_KEY_LENGTH = 64;

const HASH_PREFIX = `pbkdf2_${HASH_ALGORITHM}`;

export function hashLocalPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM);

  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export function verifyLocalPassword(password: string, storedHash: string): boolean {
  const parsed = parsePasswordHash(storedHash);
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

export function validateLocalPassword(password: string): string | null {
  const normalized = password.trim();
  if (normalized.length < 8) {
    return "Password must be at least 8 characters";
  }

  if (normalized.length > 256) {
    return "Password must be 256 characters or fewer";
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
