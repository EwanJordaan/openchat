import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/better-auth";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";
import type { Actor } from "@/lib/types";
import { createId, toBool } from "@/lib/utils";

const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 30;
const sessionCookieName = env.SESSION_COOKIE_NAME || "openchat_session";
const guestCookieName = env.GUEST_COOKIE_NAME || "openchat_guest";

export const AUTH_COOKIE_MAX_AGE = sessionTtlDays * 24 * 60 * 60;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookie(response: NextResponse, sessionToken: string) {
  response.cookies.set(sessionCookieName, sessionToken, cookieOptions(AUTH_COOKIE_MAX_AGE));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", cookieOptions(0));
}

export function ensureGuestCookie(response: NextResponse, guestId: string) {
  response.cookies.set(guestCookieName, guestId, cookieOptions(60 * 60 * 24 * 180));
}

export function clearGuestCookie(response: NextResponse) {
  response.cookies.set(guestCookieName, "", cookieOptions(0));
}

export function createGuestId() {
  return createId("gst");
}

export function setGuestCookie(response: NextResponse, guestId: string) {
  ensureGuestCookie(response, guestId);
}

async function findUserById(userId: string) {
  const { query } = getDb();
  const rows = await query<{ id: string; email: string; name: string; image_url: string | null; is_active: number }>(
    sql`select id, email, name, image_url, is_active from users where id = ${userId} limit 1`,
  );
  return rows[0] ?? null;
}

async function getUserRoles(userId: string) {
  const { query } = getDb();
  const rows = await query<{ role: string }>(sql`select role from user_roles where user_id = ${userId}`);
  const roles = rows.map((r) => r.role) as Actor["roles"];
  if (roles.length === 0) return ["user"] as Actor["roles"];
  return roles;
}

async function resolveAuthUser() {
  const requestHeaders = await headers();
  const sessionResult = await auth.api.getSession({
    headers: requestHeaders,
  });
  if (!sessionResult?.user) {
    return { user: null, needsSessionCleanup: false };
  }

  const userId = String(sessionResult.user.id);
  const dbUser = await findUserById(userId);
  if (!dbUser || !toBool(dbUser.is_active)) {
    return { user: null, needsSessionCleanup: true };
  }

  return { user: sessionResult.user, needsSessionCleanup: false };
}

export async function resolveActor() {
  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(guestCookieName)?.value;
  const guestId = existingGuestId || createGuestId();

  const { user, needsSessionCleanup } = await resolveAuthUser();
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
      needsSessionCleanup,
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
      imageUrl: (user as { image?: string | null }).image ? String((user as { image: string }).image) : null,
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
  const existingGuestId = cookieStore.get(guestCookieName)?.value;
  const guestId = existingGuestId || createGuestId();

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
