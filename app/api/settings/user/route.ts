import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { getUserSettings, upsertUserSettings } from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

const settingsSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  compactMode: z.boolean().optional(),
  enterToSend: z.boolean().optional(),
  showTokens: z.boolean().optional(),
  timezone: z.string().min(2).max(120).optional(),
  language: z.string().min(2).max(20).optional(),
  autoTitleChats: z.boolean().optional(),
});

export async function GET() {
  const resolved = await resolveActor();
  if (resolved.actor.type !== "user") {
    return jsonError("Sign in required", 401);
  }

  const settings = await getUserSettings(resolved.actor.userId);
  const response = NextResponse.json({ settings });
  return attachActorCookies(response, resolved);
}

export async function PATCH(request: Request) {
  const resolved = await resolveActor();
  if (resolved.actor.type !== "user") {
    return jsonError("Sign in required", 401);
  }

  const payload = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid settings payload", 400);
  }

  const settings = await upsertUserSettings(resolved.actor.userId, parsed.data);
  const response = NextResponse.json({ settings });
  return attachActorCookies(response, resolved);
}
