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
    const activeProviderId = container.config.ai.defaultModelProvider;
    const activeProvider = OPENCHAT_MODEL_PROVIDER_OPTIONS.find((provider) => provider.id === activeProviderId);

    const providers = activeProvider
      ? [
          activeProvider.id === "openrouter"
            ? {
                ...activeProvider,
                configured: container.modelProviderClient.isProviderConfigured(activeProvider.id),
                defaultModel:
                  OPENCHAT_PROVIDER_MODEL_PRESETS[activeProvider.id].find((modelOption) =>
                    openRouterAllowedModels.has(modelOption.id),
                  )?.id ?? OPENCHAT_PROVIDER_DEFAULT_MODELS[activeProvider.id],
                models: OPENCHAT_PROVIDER_MODEL_PRESETS[activeProvider.id].filter((modelOption) =>
                  openRouterAllowedModels.has(modelOption.id),
                ),
              }
            : {
                ...activeProvider,
                configured: container.modelProviderClient.isProviderConfigured(activeProvider.id),
                defaultModel: OPENCHAT_PROVIDER_DEFAULT_MODELS[activeProvider.id],
                models: OPENCHAT_PROVIDER_MODEL_PRESETS[activeProvider.id],
              },
        ]
      : [];

    return jsonResponse(requestId, {
      data: {
        defaultModelProvider: container.config.ai.defaultModelProvider,
        openrouterRateLimits: container.config.ai.openrouter.rateLimits,
        providers,
      },
    });
  });
}
