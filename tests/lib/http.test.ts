import { describe, expect, it } from "bun:test";
import { NextResponse } from "next/server";

import { attachActorCookies, jsonError, jsonOk, requireAdmin, requireUser } from "@/lib/http";
import type { Actor } from "@/lib/types";

const guestActor: Actor = {
  type: "guest",
  guestId: "gst_1",
  roles: ["guest"],
  userId: null,
  user: null,
};

const userActor: Actor = {
  type: "user",
  guestId: "gst_1",
  roles: ["user", "admin"],
  userId: "usr_1",
  user: { id: "usr_1", email: "admin@example.com", name: "Admin", imageUrl: null },
};

describe("lib/http", () => {
  it("returns json ok payload", async () => {
    const response = jsonOk({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns json error payload", async () => {
    const response = jsonError("Nope", 418);
    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ error: "Nope" });
  });

  it("attaches guest and session cleanup cookies when requested", () => {
    const response = NextResponse.json({ ok: true });
    const updated = attachActorCookies(response, {
      actor: guestActor,
      needsGuestCookie: true,
      needsSessionCleanup: true,
    });

    const setCookie = updated.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("openchat_guest=gst_1");
    expect(setCookie).toContain("openchat_session=");
  });

  it("enforces user and admin requirements", () => {
    expect(requireUser(userActor)).toEqual(userActor);
    expect(() => requireUser(guestActor)).toThrow("UNAUTHORIZED");
    expect(requireAdmin(userActor)).toEqual(userActor);

    const normalUser: Actor = { ...userActor, roles: ["user"] };
    expect(() => requireAdmin(normalUser)).toThrow("FORBIDDEN");
  });
});
