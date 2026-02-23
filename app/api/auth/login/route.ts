import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import {
  clearGuestCookie,
  createSessionForUser,
  lookupUserForLogin,
  resolveActor,
  setSessionCookie,
} from "@/lib/auth/session";
import { jsonError } from "@/lib/http";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid login payload", 400);
  }

  const user = await lookupUserForLogin(parsed.data.email);
  if (!user) {
    return jsonError("Invalid email or password", 401);
  }

  if (!user.isActive) {
    return jsonError("Account is disabled", 403);
  }

  const isValidPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isValidPassword) {
    return jsonError("Invalid email or password", 401);
  }

  const sessionToken = await createSessionForUser(user.id);
  const resolved = await resolveActor();

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });

  await setSessionCookie(response, sessionToken);
  await clearGuestCookie(response);

  if (resolved.needsSessionCleanup) {
    response.headers.set("x-session-cleaned", "1");
  }

  return response;
}
