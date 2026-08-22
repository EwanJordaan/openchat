import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { createChat, getPublicAppSettings, listChats } from "@/lib/db/store";
import { getCachedChatList, setCachedChatList, invalidateChatListCache } from "@/lib/cache/chat-cache";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

const createSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  modelId: z.string().min(2).max(80).optional(),
  projectId: z.string().min(2).max(80).optional().nullable(),
  agentPreset: z.enum(["research", "analyst", "builder"]).optional().nullable(),
});

function cacheKey(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  return actor.type === "user"
    ? { type: "user" as const, id: actor.userId as string }
    : { type: "guest" as const, id: actor.guestId };
}

export async function GET(req: Request) {
  await ensureDatabase();
  const resolved = await resolveActor();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId")?.trim() || undefined;
  if (!projectId) {
    const ck = cacheKey(resolved.actor);
    const cached = getCachedChatList(ck.type, ck.id);
    if (cached) {
      const response = NextResponse.json({ chats: cached, cached: true });
      return attachActorCookies(response, resolved);
    }
    const chats = await listChats(resolved.actor);
    setCachedChatList(ck.type, ck.id, chats);
    const res = NextResponse.json({ chats, cached: false });
    return attachActorCookies(res, resolved);
  }
  const chats = await listChats(resolved.actor, projectId);
  return attachActorCookies(jsonOk({ chats }), resolved);
}

export async function POST(req: Request) {
  await ensureDatabase();
  const resolved = await resolveActor();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), resolved);
  }
  const parsed = createSchema.safeParse(raw ?? {});
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), resolved);
  const settings = await getPublicAppSettings();
  const modelId = parsed.data.modelId || settings.defaultModelId;
  const title = parsed.data.title?.trim() || "New chat";
  try {
    const chatId = await createChat(resolved.actor, {
      title,
      modelId,
      projectId: parsed.data.projectId ?? null,
      agentPreset: parsed.data.agentPreset ?? null,
    });
    const ck = cacheKey(resolved.actor);
    invalidateChatListCache(ck.type, ck.id);
    const res = NextResponse.json({ chatId }, { status: 201 });
    return attachActorCookies(res, resolved);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    const status = msg.includes("Project access") ? 403 : 500;
    return attachActorCookies(jsonError(msg, status), resolved);
  }
}

export const dynamic = "force-dynamic";
