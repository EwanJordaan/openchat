import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { archiveChat, getChat, renameChat, setChatPinned } from "@/lib/db/store";
import { invalidateChatListCache } from "@/lib/cache/chat-cache";
import { attachActorCookies, jsonError } from "@/lib/http";

const patchSchema = z.union([
  z.object({ title: z.string().min(1).max(120) }).strict(),
  z.object({ isPinned: z.boolean() }).strict(),
]);

function invalidate(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  if (actor.type === "user") invalidateChatListCache("user", actor.userId);
  else invalidateChatListCache("guest", actor.guestId);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const resolved = await resolveActor();
  const chat = await getChat(resolved.actor, id);
  if (!chat) return attachActorCookies(jsonError("Chat not found", 404), resolved);
  const res = NextResponse.json({ chat });
  return attachActorCookies(res, resolved);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const resolved = await resolveActor();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), resolved);
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), resolved);
  const existing = await getChat(resolved.actor, id);
  if (!existing) return attachActorCookies(jsonError("Chat not found", 404), resolved);
  if ("title" in parsed.data) await renameChat(resolved.actor, id, parsed.data.title.trim());
  else await setChatPinned(resolved.actor, id, parsed.data.isPinned);
  invalidate(resolved.actor);
  return attachActorCookies(NextResponse.json({ ok: true }), resolved);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const resolved = await resolveActor();
  const existing = await getChat(resolved.actor, id);
  if (!existing) return attachActorCookies(jsonError("Chat not found", 404), resolved);
  await archiveChat(resolved.actor, id);
  invalidate(resolved.actor);
  return attachActorCookies(NextResponse.json({ ok: true }), resolved);
}

export const dynamic = "force-dynamic";
