import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAssistantReply } from "@/lib/ai/provider";
import { resolveActor } from "@/lib/auth/session";
import { invalidateChatListCache } from "@/lib/cache/chat-cache";
import {
  appendMessage,
  checkAndConsumeMessageQuota,
  createChat,
  getChat,
  getOwnedFiles,
  getPublicAppSettings,
  getRoleLimit,
  listModelsForActor,
  logAudit,
  touchFilesWithChat,
} from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

const sendSchema = z.object({
  chatId: z.string().min(4).max(60).optional(),
  message: z.string().min(1).max(12000),
  modelId: z.string().min(2).max(120),
  attachmentIds: z.array(z.string().min(4).max(60)).default([]),
});

function actorCacheKey(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  return actor.type === "user"
    ? { type: "user" as const, id: actor.userId }
    : { type: "guest" as const, id: actor.guestId };
}

export async function POST(request: Request) {
  const resolved = await resolveActor();
  const payload = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid chat payload", 400);
  }

  const settings = await getPublicAppSettings();
  if (resolved.actor.type === "guest" && !settings.guestEnabled) {
    return jsonError("Guest chatting is currently disabled by the admin", 403);
  }

  const models = await listModelsForActor(resolved.actor);
  const model = models.find((item) => item.id === parsed.data.modelId);
  if (!model) {
    return jsonError("The selected model is not available for your account", 403);
  }

  if (resolved.actor.type === "user") {
    const quota = await checkAndConsumeMessageQuota(resolved.actor);
    if (!quota.allowed) {
      return jsonError("Daily message limit reached for your role", 429);
    }
  }

  const roleKey = resolved.actor.type === "user" && resolved.actor.roles.includes("admin") ? "admin" : resolved.actor.type === "user" ? "user" : "guest";
  const roleLimit = await getRoleLimit(roleKey);
  if (parsed.data.attachmentIds.length > roleLimit.maxAttachmentCount) {
    return jsonError(`Attachment limit exceeded. Max ${roleLimit.maxAttachmentCount} files per message.`, 400);
  }

  const files = await getOwnedFiles(resolved.actor, parsed.data.attachmentIds);
  const totalMb = files.reduce((sum, file) => sum + file.sizeBytes / (1024 * 1024), 0);
  if (totalMb > roleLimit.maxAttachmentMb) {
    return jsonError(`Total attachments exceed ${roleLimit.maxAttachmentMb}MB for your role.`, 400);
  }

  let chatId = parsed.data.chatId;
  if (!chatId) {
    const inferredTitle = parsed.data.message.trim().slice(0, 72) || "New chat";
    chatId = await createChat(resolved.actor, inferredTitle, model.id);
  }

  await touchFilesWithChat(files.map((file) => file.id), chatId);

  await appendMessage({
    chatId,
    role: "user",
    content: parsed.data.message,
    modelId: model.id,
    attachments: files,
  });

  const hydratedChat = await getChat(resolved.actor, chatId);
  if (!hydratedChat) {
    return jsonError("Chat could not be loaded after save", 500);
  }

  const ai = await generateAssistantReply({
    model,
    messages: hydratedChat.messages,
  });

  await appendMessage({
    chatId,
    role: "assistant",
    content: ai.content,
    modelId: model.id,
  });

  await logAudit({
    actorUserId: resolved.actor.type === "user" ? resolved.actor.userId : null,
    action: "chat.send",
    targetType: "chat",
    targetId: chatId,
    payload: {
      modelId: model.id,
      providerStatus: ai.providerStatus,
      attachmentCount: files.length,
    },
  });

  const key = actorCacheKey(resolved.actor);
  invalidateChatListCache(key.type, key.id);

  const response = NextResponse.json({
    chatId,
    message: ai.content,
    usage: ai.usage,
    providerStatus: ai.providerStatus,
  });
  return attachActorCookies(response, resolved);
}
