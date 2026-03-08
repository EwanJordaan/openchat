import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { invalidateChatListCache } from "@/lib/cache/chat-cache";
import { archiveChat, getChat, renameChat, setChatPinned } from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

const patchChatSchema = z.union([
  z.object({
    title: z.string().min(1).max(120),
  }).strict(),
  z.object({
    isPinned: z.boolean(),
  }).strict(),
]);

function invalidateForActor(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  if (actor.type === "user") {
    invalidateChatListCache("user", actor.userId);
    return;
  }
  invalidateChatListCache("guest", actor.guestId);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveActor();

  const chat = await getChat(resolved.actor, id);
  if (!chat) {
    return jsonError("Chat not found", 404);
  }

  const response = NextResponse.json({ chat });
  return attachActorCookies(response, resolved);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveActor();

  const payload = await request.json().catch(() => null);
  const parsed = patchChatSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400);
  }

  if ("title" in parsed.data) {
    await renameChat(resolved.actor, id, parsed.data.title.trim());
  } else {
    await setChatPinned(resolved.actor, id, parsed.data.isPinned);
  }
  invalidateForActor(resolved.actor);

  const response = NextResponse.json({ ok: true });
  return attachActorCookies(response, resolved);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveActor();

  await archiveChat(resolved.actor, id);
  invalidateForActor(resolved.actor);

  const response = NextResponse.json({ ok: true });
  return attachActorCookies(response, resolved);
}
