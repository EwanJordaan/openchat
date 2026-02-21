import { z } from "zod";

import {
  ModelProviderConfigurationError,
  ModelProviderRequestError,
} from "@/backend/ports/model-provider-client";
import { getEffectiveOpenChatConfigSync } from "@/backend/composition/site-settings-store";
import {
  enforceOpenRouterDailyRateLimit,
  resolveAiRequestPolicy,
} from "@/backend/transport/rest/ai-policy";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, parseJsonBody } from "@/backend/transport/rest/pipeline";
import { createSseResponse } from "@/backend/transport/rest/sse";
import { OPENCHAT_MODEL_PROVIDER_IDS } from "@/shared/model-providers";

export const runtime = "nodejs";

const guestChatSchema = z.object({
  message: z.string().min(1).max(8000),
  modelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
  model: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const siteConfig = getEffectiveOpenChatConfigSync();
    if (!siteConfig.features.allowGuestResponses) {
      throw new ApiError(403, "guest_responses_disabled", "Guest responses are disabled");
    }

    const payload = await parseJsonBody(request, guestChatSchema);
    const userMessage = payload.message.trim();
    if (userMessage.length < 1 || userMessage.length > 8000) {
      throw new ApiError(400, "invalid_message", "Message must be between 1 and 8000 characters");
    }

    const aiPolicy = resolveAiRequestPolicy({
      container,
      principal: null,
      requestedModelProvider: payload.modelProvider,
      requestedModel: payload.model,
    });

    await enforceOpenRouterDailyRateLimit({
      request,
      container,
      principal: null,
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

    return createSseResponse(requestId, async (emit) => {
      let assistantMessage = "";

      for await (const chunk of generation.chunks) {
        assistantMessage += chunk;
        emit("chunk", { text: chunk });
      }

      if (!assistantMessage.trim()) {
        throw new Error("Provider returned an empty response");
      }

      emit("done", {
        message: assistantMessage,
        modelProvider: generation.modelProvider,
        model: generation.model,
      });
    });
  });
}
