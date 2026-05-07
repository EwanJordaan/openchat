import { describe, expect, it } from "bun:test";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("lib/auth/password matrix", () => {
  const passwords = [
    "password123",
    "CorrectHorseBatteryStaple!",
    "  leading-space",
    "trailing-space  ",
    "symbols-!@#$%^&*()",
    "x".repeat(72),
  ];

  for (const [index, password] of passwords.entries()) {
    it(`hashes and verifies password sample ${index + 1}`, async () => {
      const hash = await hashPassword(password);
      expect(hash).toBeString();
      expect(hash.length).toBeGreaterThan(20);
      await expect(verifyPassword(password, hash)).resolves.toBe(true);
    });
  }

  for (const [index, password] of passwords.entries()) {
    it(`rejects wrong password sample ${index + 1}`, async () => {
      const hash = await hashPassword(password);
      const wrong = password.length > 0 ? `z${password.slice(1)}` : "wrong";
      await expect(verifyPassword(wrong, hash)).resolves.toBe(false);
    });
  }

  for (let i = 0; i < 12; i += 1) {
    it(`generates different hashes for same password iteration ${i + 1}`, async () => {
      const password = `repeatable-${i}`;
      const a = await hashPassword(password);
      const b = await hashPassword(password);
      expect(a).not.toBe(b);
      await expect(verifyPassword(password, a)).resolves.toBe(true);
      await expect(verifyPassword(password, b)).resolves.toBe(true);
    });
  }
});
