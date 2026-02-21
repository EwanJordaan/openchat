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
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const guestChatSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const siteConfig = getEffectiveOpenChatConfigSync();
    if (!siteConfig.features.allowGuestResponses) {
      throw new ApiError(403, "guest_responses_disabled", "Guest responses are disabled");
    }

    const payload = await parseJsonBody(request, guestChatSchema);
    const aiPolicy = resolveAiRequestPolicy({
      container,
      principal: null,
      requestedModel: payload.model,
    });

    await enforceOpenRouterDailyRateLimit({
      request,
      container,
      principal: null,
      role: aiPolicy.role,
      modelProvider: aiPolicy.modelProvider,
    });

    try {
      const result = await container.modelProviderClient.generateText({
        modelProvider: aiPolicy.modelProvider,
        model: aiPolicy.model,
        messages: [
          {
            role: "user",
            content: payload.message,
          },
        ],
      });

      return jsonResponse(requestId, {
        data: {
          message: result.text,
          modelProvider: result.modelProvider,
          model: result.model,
        },
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
  });
}
