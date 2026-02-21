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

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createMessageSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id: chatId } = await context.params;
    await requirePermission(container, principal, "chat.message.create", {
      type: "chat",
      chatId,
    });

    const payload = await parseJsonBody(request, createMessageSchema);
    const userMessage = payload.message.trim();
    if (userMessage.length < 1 || userMessage.length > 8000) {
      throw new ApiError(400, "invalid_message", "Message must be between 1 and 8000 characters");
    }

    const aiPolicy = resolveAiRequestPolicy({
      container,
      principal,
      requestedModel: payload.model,
    });

    await enforceOpenRouterDailyRateLimit({
      request,
      container,
      principal,
      role: aiPolicy.role,
      modelProvider: aiPolicy.modelProvider,
    });

    const existingChat = await container.unitOfWork.run(async ({ chats }) => {
      return chats.getByIdForUser(chatId, principal.userId as string);
    });

    if (!existingChat) {
      throw new ApiError(404, "chat_not_found", "Chat not found");
    }

    let generation;
    try {
      generation = await container.modelProviderClient.generateTextStream({
        modelProvider: aiPolicy.modelProvider,
        model: aiPolicy.model,
        messages: [
          ...existingChat.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
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

    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();

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
        return chats.appendMessages({
          chatId,
          ownerUserId: principal.userId as string,
          userMessageId,
          userMessageContent: userMessage,
          assistantMessageId,
          assistantMessageContent: assistantMessage,
        });
      });

      if (!chat) {
        throw new Error("Chat not found");
      }

      emit("done", {
        chat,
      });
    });
  });
}
