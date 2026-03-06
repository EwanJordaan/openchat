import { NextResponse } from "next/server";

import { clearSessionCookie, ensureGuestCookie } from "@/lib/auth/session";
import type { Actor } from "@/lib/types";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function attachActorCookies(
  response: NextResponse,
  options: {
    actor: Actor;
    needsGuestCookie?: boolean;
    needsSessionCleanup?: boolean;
  },
) {
  const { actor, needsGuestCookie, needsSessionCleanup } = options;
  if (needsGuestCookie) {
    ensureGuestCookie(response, actor.guestId);
  }
  if (needsSessionCleanup) {
    clearSessionCookie(response);
  }
  return response;
}

export function requireUser(actor: Actor) {
  if (actor.type !== "user") {
    throw new Error("UNAUTHORIZED");
  }
  return actor;
}

export function requireAdmin(actor: Actor) {
  if (actor.type !== "user" || !actor.roles.includes("admin")) {
    throw new Error("FORBIDDEN");
  }
  return actor;
}
