import { z } from "zod";

import {
  ModelProviderConfigurationError,
  ModelProviderRequestError,
} from "@/backend/ports/model-provider-client";
import {
  enforceOpenRouterDailyRateLimit,
  resolveAiRequestPolicy,
} from "@/backend/transport/rest/ai-policy";
import { ApiError } from "@/backend/transport/rest/api-error";
import {
  handleApiRoute,
  parseJsonBody,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";
import { createSseResponse } from "@/backend/transport/rest/sse";
import { OPENCHAT_MODEL_PROVIDER_IDS } from "@/shared/model-providers";

export const runtime = "nodejs";

const createChatSchema = z.object({
  message: z.string().min(1).max(8000),
  modelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
  model: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "chat.create", { type: "global" });

    const payload = await parseJsonBody(request, createChatSchema);
    const userMessage = payload.message.trim();
    if (userMessage.length < 1 || userMessage.length > 8000) {
      throw new ApiError(400, "invalid_message", "Message must be between 1 and 8000 characters");
    }

    const aiPolicy = resolveAiRequestPolicy({
      container,
      principal,
      requestedModelProvider: payload.modelProvider,
      requestedModel: payload.model,
    });

    await enforceOpenRouterDailyRateLimit({
      request,
      container,
      principal,
      role: aiPolicy.role,
      modelProvider: aiPolicy.modelProvider,
    });

    let generation;
    try {
      generation = await container.modelProviderClient.generateTextStream({
        modelProvider: aiPolicy.modelProvider,
        model: aiPolicy.model,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });
    } catch (error) {
      if (error instanceof ModelProviderConfigurationError) {
        throw new ApiError(400, "provider_not_configured", error.message);
      }

      if (error instanceof ModelProviderRequestError) {
        throw new ApiError(502, "provider_request_failed", error.message);
      }

      throw error;
    }

    const chatId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const chatTitle = buildChatTitleFromMessage(userMessage);

    return createSseResponse(requestId, async (emit) => {
      let assistantMessage = "";

      for await (const chunk of generation.chunks) {
        assistantMessage += chunk;
        emit("chunk", { text: chunk });
      }

      if (!assistantMessage.trim()) {
        throw new Error("Provider returned an empty response");
      }

      const chat = await container.unitOfWork.run(async ({ chats }) => {
        return chats.createWithInitialMessages({
          chatId,
          ownerUserId: principal.userId as string,
          title: chatTitle,
          userMessageId,
          userMessageContent: userMessage,
          assistantMessageId,
          assistantMessageContent: assistantMessage,
        });
      });

      emit("done", {
        chat,
      });
    });
  });
}

function buildChatTitleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 61).trimEnd()}...`;
}
