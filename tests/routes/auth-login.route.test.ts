import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Actor } from "@/lib/types";

const verifyPassword = mock(async () => true);

const clearGuestCookie = mock(() => undefined);
const createSessionForUser = mock(async () => "session-token");
const lookupUserForLogin = mock(async () => null as null | {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  isActive: boolean;
});
const resolveActor = mock(async () => ({
  actor: {
    type: "guest",
    guestId: "gst_1",
    roles: ["guest"],
    userId: null,
    user: null,
  } as Actor,
  needsGuestCookie: true,
  needsSessionCleanup: false,
}));
const setSessionCookie = mock(() => undefined);

mock.module("@/lib/auth/password", () => ({
  verifyPassword,
}));
mock.module("@/lib/auth/session", () => ({
  clearGuestCookie,
  createSessionForUser,
  lookupUserForLogin,
  resolveActor,
  setSessionCookie,
}));

let POST: (typeof import("@/app/api/auth/login/route"))["POST"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/auth/login/route"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  verifyPassword.mockClear();
  clearGuestCookie.mockClear();
  createSessionForUser.mockClear();
  lookupUserForLogin.mockClear();
  resolveActor.mockClear();
  setSessionCookie.mockClear();
});

describe("app/api/auth/login POST", () => {
  it("returns 400 for invalid payload", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 401 when user does not exist", async () => {
    lookupUserForLogin.mockResolvedValue(null);

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "missing@example.com", password: "password123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid email or password" });
  });

  it("returns 403 when account is disabled", async () => {
    lookupUserForLogin.mockResolvedValue({
      id: "usr_1",
      email: "disabled@example.com",
      passwordHash: "hash",
      name: "Disabled",
      isActive: false,
    });

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "disabled@example.com", password: "password123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 401 when password verification fails", async () => {
    lookupUserForLogin.mockResolvedValue({
      id: "usr_1",
      email: "user@example.com",
      passwordHash: "hash",
      name: "User",
      isActive: true,
    });
    verifyPassword.mockResolvedValue(false);

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 and sets cleanup header on successful login", async () => {
    lookupUserForLogin.mockResolvedValue({
      id: "usr_1",
      email: "user@example.com",
      passwordHash: "hash",
      name: "User",
      isActive: true,
    });
    verifyPassword.mockResolvedValue(true);
    resolveActor.mockResolvedValue({
      actor: {
        type: "guest",
        guestId: "gst_1",
        roles: ["guest"],
        userId: null,
        user: null,
      } as Actor,
      needsGuestCookie: true,
      needsSessionCleanup: true,
    });

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-session-cleaned")).toBe("1");
    expect(setSessionCookie.mock.calls.length).toBe(1);
    expect(clearGuestCookie.mock.calls.length).toBe(1);
  });
});
