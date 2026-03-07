import { describe, expect, it } from "bun:test";

function importEnvWith(overrides: Record<string, string | undefined>) {
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }

  return Bun.spawnSync({
    cmd: ["bun", "-e", "import('./lib/env.ts')"],
    cwd: process.cwd(),
    env: childEnv,
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("lib/env BETTER_AUTH_SECRET validation", () => {
  it("fails startup when BETTER_AUTH_SECRET is missing", () => {
    const proc = importEnvWith({
      BETTER_AUTH_SECRET: undefined,
      NODE_ENV: "test",
    });
    expect(proc.exitCode).not.toBe(0);
  });

  it("fails startup when BETTER_AUTH_SECRET is too short", () => {
    const proc = importEnvWith({
      BETTER_AUTH_SECRET: "short-secret",
      NODE_ENV: "test",
    });
    expect(proc.exitCode).not.toBe(0);
  });
});
