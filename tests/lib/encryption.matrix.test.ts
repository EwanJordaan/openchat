import { describe, expect, it } from "bun:test";

import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

describe("lib/security/encryption matrix", () => {
  const samples = [
    "",
    "a",
    "hello",
    "with spaces and numbers 1234",
    "symbols !@#$%^&*()",
    "unicode-safe-ascii-only",
    "x".repeat(256),
  ];

  for (const [index, sample] of samples.entries()) {
    it(`round-trips sample ${index + 1}`, () => {
      const encrypted = encryptSecret(sample);
      expect(encrypted.split(":")).toHaveLength(3);
      expect(decryptSecret(encrypted)).toBe(sample);
    });
  }

  const malformed = [
    "",
    ":",
    "abc",
    "abc:def",
    "abc:def:ghi:jkl",
    "not-base64:not-base64:not-base64",
  ];

  for (const [index, payload] of malformed.entries()) {
    it(`returns empty for malformed payload ${index + 1}`, () => {
      expect(decryptSecret(payload)).toBe("");
    });
  }

  for (let i = 0; i < 30; i += 1) {
    it(`produces unique ciphertext with random iv iteration ${i + 1}`, () => {
      const value = `secret-${i}`;
      const a = encryptSecret(value);
      const b = encryptSecret(value);
      expect(a).not.toBe(b);
      expect(decryptSecret(a)).toBe(value);
      expect(decryptSecret(b)).toBe(value);
    });
  }
});
