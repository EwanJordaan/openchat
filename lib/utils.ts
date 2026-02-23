import { customAlphabet } from "nanoid";

const idAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const randomId = customAlphabet(idAlphabet, 14);

export function createId(prefix: string) {
  return `${prefix}_${randomId()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

export function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
