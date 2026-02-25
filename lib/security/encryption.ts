import crypto from "node:crypto";

import { env } from "@/lib/env";

function resolveKey() {
  const source = env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (!source) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is required to encrypt or decrypt provider secrets.");
  }
  return crypto.createHash("sha256").update(source).digest();
}

let key: Buffer | null = null;

function getKey() {
  if (!key) {
    key = resolveKey();
  }
  return key;
}

export function encryptSecret(plainText: string) {
  const encryptionKey = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

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

  try {
    const encryptionKey = getKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}
