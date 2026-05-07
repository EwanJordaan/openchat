import { describe, expect, it } from "bun:test";

import { assertRateLimit, clearRateLimit, getClientAddress, registerRateLimitFailure } from "@/lib/auth/rate-limit";

describe("lib/auth/rate-limit matrix", () => {
  const windows = [50, 200, 1000];
  const maxAttemptsList = [1, 2, 3, 5];
  const blockDurations = [100, 250, 500];

  let caseId = 0;
  for (const windowMs of windows) {
    for (const maxAttempts of maxAttemptsList) {
      for (const blockMs of blockDurations) {
        for (const failureCount of [0, 1, 2, 3, 4, 5, 6]) {
          caseId += 1;
          it(`enforces blocking case ${caseId} (w=${windowMs}, max=${maxAttempts}, block=${blockMs}, failures=${failureCount})`, () => {
            const scope = `scope-${caseId}`;
            const identifier = `id-${caseId}`;
            const config = { windowMs, maxAttempts, blockMs };
            clearRateLimit(scope, identifier);

            for (let i = 0; i < failureCount; i += 1) {
              registerRateLimitFailure(scope, identifier, config);
            }

            const decision = assertRateLimit(scope, identifier, config);
            expect(decision.allowed).toBe(failureCount <= maxAttempts);
            if (failureCount > maxAttempts) {
              expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
            } else {
              expect(decision.retryAfterSeconds).toBe(0);
            }
          });
        }
      }
    }
  }

  for (let i = 0; i < 25; i += 1) {
    it(`clearRateLimit unblocks immediately ${i + 1}`, () => {
      const scope = `clear-${i}`;
      const identifier = `id-${i}`;
      const config = { windowMs: 1000, maxAttempts: 1, blockMs: 1000 };
      clearRateLimit(scope, identifier);

      registerRateLimitFailure(scope, identifier, config);
      registerRateLimitFailure(scope, identifier, config);
      expect(assertRateLimit(scope, identifier, config).allowed).toBe(false);

      clearRateLimit(scope, identifier);
      expect(assertRateLimit(scope, identifier, config)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    });
  }

  for (let i = 0; i < 15; i += 1) {
    it(`unblocks after block window ${i + 1}`, async () => {
      const scope = `expiry-${i}`;
      const identifier = `id-${i}`;
      const config = { windowMs: 100, maxAttempts: 1, blockMs: 10 };
      clearRateLimit(scope, identifier);

      registerRateLimitFailure(scope, identifier, config);
      registerRateLimitFailure(scope, identifier, config);
      expect(assertRateLimit(scope, identifier, config).allowed).toBe(false);

      await Bun.sleep(20);
      expect(assertRateLimit(scope, identifier, config).allowed).toBe(true);
    });
  }

  const ipCases = [
    { name: "forwarded first", headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }, expected: "10.0.0.1" },
    { name: "forwarded single", headers: { "x-forwarded-for": "10.0.0.3" }, expected: "10.0.0.3" },
    { name: "forwarded trimmed", headers: { "x-forwarded-for": " 10.0.0.4 , 10.0.0.5 " }, expected: "10.0.0.4" },
    { name: "cf", headers: { "cf-connecting-ip": "1.1.1.1" }, expected: "1.1.1.1" },
    { name: "real ip", headers: { "x-real-ip": "2.2.2.2" }, expected: "2.2.2.2" },
    { name: "unknown", headers: {}, expected: "unknown" },
  ] as const;

  for (let i = 0; i < 10; i += 1) {
    for (const entry of ipCases) {
      it(`getClientAddress ${entry.name} variant ${i + 1}`, () => {
        const request = new Request("http://localhost", { headers: entry.headers });
        expect(getClientAddress(request)).toBe(entry.expected);
      });
    }
  }
});
