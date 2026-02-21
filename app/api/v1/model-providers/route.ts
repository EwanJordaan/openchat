import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";
import {
  OPENCHAT_MODEL_PROVIDER_OPTIONS,
  OPENCHAT_PROVIDER_DEFAULT_MODELS,
  OPENCHAT_PROVIDER_MODEL_PRESETS,
} from "@/shared/model-providers";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const openRouterAllowedModels = new Set(container.config.ai.openrouter.allowedModels);

    const providers = OPENCHAT_MODEL_PROVIDER_OPTIONS.map((provider) => {
      if (provider.id === "openrouter") {
        const allowedOpenRouterModels = OPENCHAT_PROVIDER_MODEL_PRESETS[provider.id].filter(
          (modelOption) => openRouterAllowedModels.has(modelOption.id),
        );

        return {
          ...provider,
          configured: container.modelProviderClient.isProviderConfigured(provider.id),
          defaultModel:
            allowedOpenRouterModels[0]?.id ?? OPENCHAT_PROVIDER_DEFAULT_MODELS[provider.id],
          models: allowedOpenRouterModels,
        };
      }

      return {
        ...provider,
        configured: container.modelProviderClient.isProviderConfigured(provider.id),
        defaultModel: OPENCHAT_PROVIDER_DEFAULT_MODELS[provider.id],
        models: OPENCHAT_PROVIDER_MODEL_PRESETS[provider.id],
      };
    });

    return jsonResponse(requestId, {
      data: {
        defaultModelProvider: container.config.ai.defaultModelProvider,
        allowUserModelProviderSelection: container.config.ai.allowUserModelProviderSelection,
        openrouterRateLimits: container.config.ai.openrouter.rateLimits,
        providers,
      },
    });
  });
}
