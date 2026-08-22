import { describe, it, expect } from "bun:test";

describe("integration — smoke", () => {
  it("placeholder passes without DB", () => {
    expect(1 + 1).toBe(2);
  });

  it("env is sane in test", () => {
    expect(process.env.BETTER_AUTH_SECRET).toBeDefined();
    expect(process.env.DATABASE_PROVIDER).toBeDefined();
  });
});
