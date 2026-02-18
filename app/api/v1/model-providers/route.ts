import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";
import { OPENCHAT_MODEL_PROVIDER_OPTIONS } from "@/shared/model-providers";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const providers = OPENCHAT_MODEL_PROVIDER_OPTIONS.map((provider) => ({
      ...provider,
      configured: container.modelProviderClient.isProviderConfigured(provider.id),
    }));

    return jsonResponse(requestId, {
      data: {
        defaultModelProvider: container.config.ai.defaultModelProvider,
        providers,
      },
    });
  });
}
