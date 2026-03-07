import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const authPost = mock(async () => Response.json({ ok: true }, { status: 200 }));
const authGet = mock(async () => new Response(null, { status: 204 }));
const authPut = mock(async () => new Response(null, { status: 204 }));
const authPatch = mock(async () => new Response(null, { status: 204 }));
const authDelete = mock(async () => new Response(null, { status: 204 }));

const findUserByEmail = mock(async () => null as null | { is_active: number | boolean });

const assertRateLimit = mock(() => ({ allowed: true, retryAfterSeconds: 0 }));
const registerRateLimitFailure = mock(() => undefined);
const clearRateLimit = mock(() => undefined);
const getClientAddress = mock(() => "203.0.113.10");

mock.module("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: authGet,
    POST: authPost,
    PUT: authPut,
    PATCH: authPatch,
    DELETE: authDelete,
  }),
}));

mock.module("@/lib/auth/better-auth", () => ({
  auth: {},
}));

mock.module("@/lib/db/store", () => ({
  findUserByEmail,
}));

mock.module("@/lib/auth/rate-limit", () => ({
  assertRateLimit,
  registerRateLimitFailure,
  clearRateLimit,
  getClientAddress,
}));

mock.module("@/lib/env", () => ({
  env: {
    AUTH_LOGIN_WINDOW_MS: 60_000,
    AUTH_LOGIN_MAX_ATTEMPTS: 5,
    AUTH_LOGIN_BLOCK_MS: 120_000,
    AUTH_REGISTER_WINDOW_MS: 60_000,
    AUTH_REGISTER_MAX_ATTEMPTS: 3,
    AUTH_REGISTER_BLOCK_MS: 120_000,
  },
}));

let POST: (typeof import("@/app/api/auth/[...all]/route"))["POST"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/auth/[...all]/route"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  authPost.mockClear();
  assertRateLimit.mockClear();
  registerRateLimitFailure.mockClear();
  clearRateLimit.mockClear();
  findUserByEmail.mockClear();
  getClientAddress.mockClear();

  authPost.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));
  assertRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  findUserByEmail.mockResolvedValue(null);
  getClientAddress.mockReturnValue("203.0.113.10");
});

function createRequest(pathname: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("app/api/auth/[...all] POST", () => {
  it("returns 429 when sign-in rate limit is blocked", async () => {
    assertRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 9 });

    const response = await POST(createRequest("/api/auth/sign-in/email", { email: "ada@example.com", password: "pw" }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Too many authentication attempts. Please try again later.",
      retryAfterSeconds: 9,
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  it("blocks disabled users from sign-in", async () => {
    findUserByEmail.mockResolvedValue({ is_active: 0 });

    const response = await POST(createRequest("/api/auth/sign-in/email", { email: "ada@example.com", password: "pw" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid email or password" });
    expect(authPost).not.toHaveBeenCalled();
    expect(registerRateLimitFailure).toHaveBeenCalledWith(
      "auth-login",
      "203.0.113.10:ada@example.com",
      expect.objectContaining({ maxAttempts: 5 }),
    );
  });

  it("clears login rate limit on successful sign-in", async () => {
    authPost.mockResolvedValue(Response.json({ token: "ok" }, { status: 200 }));

    const response = await POST(createRequest("/api/auth/sign-in/email", { email: "ada@example.com", password: "pw" }));

    expect(response.status).toBe(200);
    expect(clearRateLimit).toHaveBeenCalledWith("auth-login", "203.0.113.10:ada@example.com");
    expect(registerRateLimitFailure).not.toHaveBeenCalled();
  });

  it("registers rate-limit failure on unsuccessful sign-up", async () => {
    authPost.mockResolvedValue(Response.json({ error: "exists" }, { status: 400 }));

    const response = await POST(createRequest("/api/auth/sign-up/email", { email: "ada@example.com", password: "pw" }));

    expect(response.status).toBe(400);
    expect(registerRateLimitFailure).toHaveBeenCalledWith(
      "auth-register",
      "203.0.113.10:ada@example.com",
      expect.objectContaining({ maxAttempts: 3 }),
    );
    expect(clearRateLimit).not.toHaveBeenCalled();
  });
});
