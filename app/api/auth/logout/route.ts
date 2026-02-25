import { NextResponse } from "next/server";

import { clearSessionCookie, ensureGuestCookie, logoutCurrentSession, resolveActor } from "@/lib/auth/session";

export async function POST() {
  const resolved = await resolveActor();
  await logoutCurrentSession();

  const response = NextResponse.json({ ok: true });
  await clearSessionCookie(response);
  await ensureGuestCookie(response, resolved.actor.guestId);
  return response;
}
