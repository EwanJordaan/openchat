import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { Role } from "@/lib/types";

const cookieGet = mock((name: string) => {
  if (name === "openchat_guest") return { value: "gst_cookie" };
  return undefined;
});

const nextCookies = mock(async () => ({
  get: cookieGet,
}));

const nextHeaders = mock(async () => new Headers());

const getSession = mock(async () => null as null | { user: { id: string; email: string; name: string; image?: string | null } });

const findUserById = mock(async () => null as null | { id: string; is_active: number | boolean });
const getUserRoles = mock(async () => ["user"] as Role[]);

mock.module("next/headers", () => ({
  cookies: nextCookies,
  headers: nextHeaders,
}));

mock.module("@/lib/auth/better-auth", () => ({
  auth: {
    api: {
      getSession,
      signOut: mock(async () => undefined),
    },
  },
}));

mock.module("@/lib/db/store", () => ({
  findUserById,
  getUserRoles,
}));

mock.module("@/lib/env", () => ({
  env: {
    SESSION_TTL_DAYS: 30,
    SESSION_COOKIE_NAME: "openchat_session",
    GUEST_COOKIE_NAME: "openchat_guest",
  },
  isProduction: false,
}));

let resolveActor: (typeof import("@/lib/auth/session"))["resolveActor"];

beforeAll(async () => {
  ({ resolveActor } = await import("@/lib/auth/session"));
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  cookieGet.mockClear();
  nextCookies.mockClear();
  nextHeaders.mockClear();
  getSession.mockClear();
  findUserById.mockClear();
  getUserRoles.mockClear();

  getSession.mockResolvedValue({
    user: {
      id: "usr_1",
      email: "ada@example.com",
      name: "Ada",
      image: null,
    },
  });
  findUserById.mockResolvedValue({ id: "usr_1", is_active: 1 });
  getUserRoles.mockResolvedValue(["user"]);
});

describe("lib/auth/session resolveActor", () => {
  it("downgrades inactive sessions to guest actor and requests cleanup", async () => {
    findUserById.mockResolvedValue({ id: "usr_1", is_active: 0 });

    const result = await resolveActor();

    expect(result.actor.type).toBe("guest");
    expect(result.needsSessionCleanup).toBeTrue();
    expect(getUserRoles).not.toHaveBeenCalled();
  });

  it("returns user actor for active sessions", async () => {
    const result = await resolveActor();

    expect(result.actor.type).toBe("user");
    expect(result.needsSessionCleanup).toBeFalse();
    expect(getUserRoles).toHaveBeenCalledWith("usr_1");
  });
});
