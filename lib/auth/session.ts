import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/better-auth";
import { getUserRoles } from "@/lib/db/store";
import { env, isProduction } from "@/lib/env";
import type { Actor } from "@/lib/types";
import { createId } from "@/lib/utils";

export const AUTH_COOKIE_MAX_AGE = env.SESSION_TTL_DAYS * 24 * 60 * 60;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookie(response: NextResponse, sessionToken: string) {
  response.cookies.set(env.SESSION_COOKIE_NAME, sessionToken, cookieOptions(AUTH_COOKIE_MAX_AGE));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(env.SESSION_COOKIE_NAME, "", cookieOptions(0));
}

export function ensureGuestCookie(response: NextResponse, guestId: string) {
  response.cookies.set(env.GUEST_COOKIE_NAME, guestId, cookieOptions(60 * 60 * 24 * 180));
}

export function clearGuestCookie(response: NextResponse) {
  response.cookies.set(env.GUEST_COOKIE_NAME, "", cookieOptions(0));
}

async function resolveAuthUser() {
  const requestHeaders = await headers();
  const sessionResult = await auth.api.getSession({
    headers: requestHeaders,
  });
  if (!sessionResult?.user) return null;
  return sessionResult.user;
}

export async function resolveActor() {
  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(env.GUEST_COOKIE_NAME)?.value;
  const guestId = existingGuestId || createId("gst");

  const user = await resolveAuthUser();
  if (!user) {
    const guestActor: Actor = {
      type: "guest",
      guestId,
      roles: ["guest"],
      userId: null,
      user: null,
    };
    return {
      actor: guestActor,
      needsGuestCookie: !existingGuestId,
      needsSessionCleanup: false,
    };
  }

  const roles = await getUserRoles(String(user.id));
  const userActor: Actor = {
    type: "user",
    guestId,
    roles,
    userId: String(user.id),
    user: {
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      imageUrl: user.image ? String(user.image) : null,
    },
  };

  return {
    actor: userActor,
    needsGuestCookie: !existingGuestId,
    needsSessionCleanup: false,
  };
}

export async function resolveGuestActorFromCookies() {
  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(env.GUEST_COOKIE_NAME)?.value;
  const guestId = existingGuestId || createId("gst");

  const guestActor: Actor = {
    type: "guest",
    guestId,
    roles: ["guest"],
    userId: null,
    user: null,
  };

  return {
    actor: guestActor,
    needsGuestCookie: !existingGuestId,
    needsSessionCleanup: false,
  };
}

export async function logoutCurrentSession() {
  const requestHeaders = await headers();
  await auth.api.signOut({
    headers: requestHeaders,
  });
}
