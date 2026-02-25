import crypto from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { adminEmailSet, env, isProduction } from "@/lib/env";
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  findUserByEmail,
  getSessionUser,
  getUserRoles,
  setUserRoles,
} from "@/lib/db/store";
import type { Actor } from "@/lib/types";
import { createId, toBool } from "@/lib/utils";

export const AUTH_COOKIE_MAX_AGE = env.SESSION_TTL_DAYS * 24 * 60 * 60;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function setSessionCookie(response: NextResponse, sessionToken: string) {
  response.cookies.set(env.SESSION_COOKIE_NAME, sessionToken, cookieOptions(AUTH_COOKIE_MAX_AGE));
}

export async function clearSessionCookie(response: NextResponse) {
  response.cookies.set(env.SESSION_COOKIE_NAME, "", cookieOptions(0));
}

export async function ensureGuestCookie(response: NextResponse, guestId: string) {
  response.cookies.set(env.GUEST_COOKIE_NAME, guestId, cookieOptions(60 * 60 * 24 * 180));
}

export async function clearGuestCookie(response: NextResponse) {
  response.cookies.set(env.GUEST_COOKIE_NAME, "", cookieOptions(0));
}

export async function createSessionForUser(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000).toISOString();
  await createSession(userId, tokenHash, expiresAt);
  return token;
}

export async function resolveActor() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  const existingGuestId = cookieStore.get(env.GUEST_COOKIE_NAME)?.value;
  const guestId = existingGuestId || createId("gst");

  if (!sessionToken) {
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

  const session = await getSessionUser(hashToken(sessionToken));
  if (!session) {
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
      needsSessionCleanup: true,
    };
  }

  const userActor: Actor = {
    type: "user",
    guestId,
    roles: session.roles,
    userId: session.user.id,
    user: session.user,
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
    needsSessionCleanup: true,
  };
}

export async function logoutCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return;
  await deleteSessionByTokenHash(hashToken(token));
}

export async function bootstrapAdminRole(email: string, userId: string) {
  if (!adminEmailSet.has(email.trim().toLowerCase())) return;
  const roles = await getUserRoles(userId);
  if (!roles.includes("admin")) {
    await setUserRoles(userId, [...roles, "admin"]);
  }
}

export async function lookupUserForLogin(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.password_hash,
    name: user.name,
    isActive: toBool(user.is_active),
  };
}

export async function registerNewUser(input: {
  email: string;
  passwordHash: string;
  name: string;
}) {
  const existing = await findUserByEmail(input.email);
  if (existing) return null;
  const user = await createUser(input);
  await bootstrapAdminRole(user.email, user.id);
  return user;
}
