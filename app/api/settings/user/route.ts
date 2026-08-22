import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getUserSettings, upsertUserSettings } from "@/lib/db/store";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

const schema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  compactMode: z.boolean().optional(),
  enterToSend: z.boolean().optional(),
  showTokens: z.boolean().optional(),
  timezone: z.string().min(2).max(120).optional(),
  language: z.string().min(2).max(20).optional(),
  autoTitleChats: z.boolean().optional(),
});

export async function GET() {
  await ensureDatabase();
  const resolved = await resolveActor();
  if (resolved.actor.type !== "user") return jsonError("Sign in required", 401);
  const settings = await getUserSettings(resolved.actor.userId);
  return attachActorCookies(jsonOk({ settings }), resolved);
}

export async function PUT(req: Request) {
  return handlePatch(req);
}

export async function PATCH(req: Request) {
  return handlePatch(req);
}

async function handlePatch(req: Request) {
  await ensureDatabase();
  const resolved = await resolveActor();
  if (resolved.actor.type !== "user") return jsonError("Sign in required", 401);
  let raw: unknown;
  try { raw = await req.json(); } catch { return attachActorCookies(jsonError("Invalid JSON", 400), resolved); }
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), resolved);
  const settings = await upsertUserSettings(resolved.actor.userId, parsed.data);
  return attachActorCookies(jsonOk({ settings }), resolved);
}

export const dynamic = "force-dynamic";
