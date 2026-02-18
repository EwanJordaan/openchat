import { z } from "zod";

import {
  ModelProviderConfigurationError,
  ModelProviderRequestError,
} from "@/backend/ports/model-provider-client";
import { getEffectiveOpenChatConfigSync } from "@/backend/composition/site-settings-store";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";
import { OPENCHAT_MODEL_PROVIDER_IDS } from "@/shared/model-providers";

export const runtime = "nodejs";

const guestChatSchema = z.object({
  message: z.string().min(1).max(8000),
  modelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const siteConfig = getEffectiveOpenChatConfigSync();
    if (!siteConfig.features.allowGuestResponses) {
      throw new ApiError(403, "guest_responses_disabled", "Guest responses are disabled");
    }

    const payload = await parseJsonBody(request, guestChatSchema);
    const modelProvider = payload.modelProvider ?? container.config.ai.defaultModelProvider;

    try {
      const result = await container.modelProviderClient.generateText({
        modelProvider,
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
