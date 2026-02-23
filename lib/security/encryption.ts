import crypto from "node:crypto";

import { env } from "@/lib/env";

function normalizeKey(rawKey: string | undefined) {
  const source = rawKey?.trim() || "openchat-local-dev-encryption-key";
  return crypto.createHash("sha256").update(source).digest();
}

const key = normalizeKey(env.SETTINGS_ENCRYPTION_KEY);

export function encryptSecret(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(encryptedPayload: string | null | undefined) {
  if (!encryptedPayload) return "";

  const [ivB64, tagB64, dataB64] = encryptedPayload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "";

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
