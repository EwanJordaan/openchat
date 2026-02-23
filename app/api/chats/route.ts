import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { getCachedChatList, invalidateChatListCache, setCachedChatList } from "@/lib/cache/chat-cache";
import { createChat, getPublicAppSettings, listChats } from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

const createChatSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  modelId: z.string().min(2).max(120).optional(),
});

function actorCacheKey(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  return actor.type === "user"
    ? { type: "user" as const, id: actor.userId }
    : { type: "guest" as const, id: actor.guestId };
}

export async function GET() {
  const resolved = await resolveActor();
  const key = actorCacheKey(resolved.actor);
  const cached = getCachedChatList(key.type, key.id);

  if (cached) {
    const response = NextResponse.json({ chats: cached, cached: true });
    return attachActorCookies(response, resolved);
  }

  const chats = await listChats(resolved.actor);
  setCachedChatList(key.type, key.id, chats);

  const response = NextResponse.json({ chats, cached: false });
  return attachActorCookies(response, resolved);
}

export async function POST(request: Request) {
  const resolved = await resolveActor();
  const payload = await request.json().catch(() => null);
  const parsed = createChatSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400);
  }

  const settings = await getPublicAppSettings();
  const modelId = parsed.data.modelId || settings.defaultModelId;
  const title = parsed.data.title?.trim() || "New chat";
  const chatId = await createChat(resolved.actor, title, modelId);

  const key = actorCacheKey(resolved.actor);
  invalidateChatListCache(key.type, key.id);

  const response = NextResponse.json({
    chatId,
  });
  return attachActorCookies(response, resolved);
}
