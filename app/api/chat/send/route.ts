import { NextResponse } from "next/server";
import { z } from "zod";

import { streamAssistantReply } from "@/lib/ai/provider";
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
  rewriteUserMessageAndTrimFollowing,
  touchFilesWithChat,
} from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

const sendSchema = z.object({
  chatId: z.string().min(4).max(60).optional(),
  editMessageId: z.string().min(4).max(60).optional(),
  message: z.string().min(1).max(12000),
  modelId: z.string().min(2).max(120),
  attachmentIds: z.array(z.string().min(4).max(60)).default([]),
});

function actorCacheKey(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  return actor.type === "user"
    ? { type: "user" as const, id: actor.userId }
    : { type: "guest" as const, id: actor.guestId };
}

function resolveRoleKey(actor: Awaited<ReturnType<typeof resolveActor>>["actor"]) {
  if (actor.type === "guest") return "guest" as const;
  return actor.roles.includes("admin") ? "admin" : "user";
}

export async function POST(request: Request) {
  const resolved = await resolveActor();
  const payload = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid chat payload", 400);
  }

  const message = parsed.data.message.trimEnd();
  if (!message.trim()) {
    return jsonError("Message must include non-whitespace text", 400);
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

  const roleKey = resolveRoleKey(resolved.actor);
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
  if (parsed.data.editMessageId && !chatId) {
    return jsonError("Editing a message requires a chat id", 400);
  }

  if (parsed.data.editMessageId && parsed.data.attachmentIds.length) {
    return jsonError("Editing a message does not support attachment changes", 400);
  }

  if (!chatId) {
    const inferredTitle = message.trim().slice(0, 72) || "New chat";
    chatId = await createChat(resolved.actor, inferredTitle, model.id);
  } else {
    const existingChat = await getChat(resolved.actor, chatId);
    if (!existingChat) {
      return jsonError("Chat not found", 404);
    }
  }

  if (parsed.data.editMessageId) {
    const rewriteResult = await rewriteUserMessageAndTrimFollowing(resolved.actor, {
      chatId,
      messageId: parsed.data.editMessageId,
      content: message,
    });

    if (!rewriteResult.ok) {
      if (rewriteResult.reason === "chat-not-found") {
        return jsonError("Chat not found", 404);
      }
      if (rewriteResult.reason === "not-user-message") {
        return jsonError("Only user messages can be edited", 400);
      }
      return jsonError("Message not found", 404);
    }
  } else {
    await touchFilesWithChat(files.map((file) => file.id), chatId);

    await appendMessage({
      chatId,
      role: "user",
      content: message,
      modelId: model.id,
      attachments: files,
    });
  }

  const hydratedChat = await getChat(resolved.actor, chatId);
  if (!hydratedChat) {
    return jsonError("Chat could not be loaded after save", 500);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let assistantContent = "";
        let assistantPersisted = false;
        let providerStatus = "ok";
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        try {
          const streamed = await streamAssistantReply({
            model,
            messages: hydratedChat.messages,
            signal: request.signal,
            onToken: (token) => {
              assistantContent += token;
              controller.enqueue(encoder.encode(token));
            },
          });

          providerStatus = streamed.providerStatus;
          usage = streamed.usage;
          if (!assistantContent && streamed.content) {
            assistantContent = streamed.content;
          }

          if (assistantContent.trim()) {
            await appendMessage({
              chatId,
              role: "assistant",
              content: assistantContent,
              modelId: model.id,
            });
            assistantPersisted = true;
          }

          await logAudit({
            actorUserId: resolved.actor.type === "user" ? resolved.actor.userId : null,
            action: "chat.send",
            targetType: "chat",
            targetId: chatId,
            payload: {
              modelId: model.id,
              editedMessageId: parsed.data.editMessageId ?? null,
              providerStatus,
              attachmentCount: files.length,
              usage,
            },
          });
        } catch {
          if (!assistantPersisted && assistantContent.trim()) {
            await appendMessage({
              chatId,
              role: "assistant",
              content: assistantContent,
              modelId: model.id,
            });
          }
        } finally {
          const key = actorCacheKey(resolved.actor);
          invalidateChatListCache(key.type, key.id);
          try {
            controller.close();
          } catch {
            return;
          }
        }
      })();
    },
  });

  const response = new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Chat-Id": chatId,
    },
  });
  return attachActorCookies(response, resolved);
}
