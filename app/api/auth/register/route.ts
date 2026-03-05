import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import {
  clearGuestCookie,
  createSessionForUser,
  registerNewUser,
  setSessionCookie,
} from "@/lib/auth/session";
import { jsonError } from "@/lib/http";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid registration payload", 400);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await registerNewUser({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash,
  });

  if (!user) {
    return jsonError("An account with this email already exists", 409);
  }

  const sessionToken = await createSessionForUser(user.id);

  const response = NextResponse.json({
    ok: true,
    user,
  });

  setSessionCookie(response, sessionToken);
  clearGuestCookie(response);

  return response;
}
