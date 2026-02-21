import { loadAdminRuntimeConfig, type AdminRuntimeConfig } from "@/backend/composition/admin-runtime-config";
import { getOrCreateRequestId } from "@/backend/transport/rest/pipeline";
import { toErrorResponse } from "@/backend/transport/rest/api-error";

export interface AdminApiRequestContext {
  requestId: string;
  config: AdminRuntimeConfig;
}

export async function handleAdminApiRoute(
  request: Request,
  handler: (context: AdminApiRequestContext) => Promise<Response>,
): Promise<Response> {
  const requestId = getOrCreateRequestId(request);

  try {
    const response = await handler({
      requestId,
      config: loadAdminRuntimeConfig(),
    });

    if (!response.headers.has("x-request-id")) {
      try {
        response.headers.set("x-request-id", requestId);
      } catch {
        const headers = new Headers(response.headers);
        headers.set("x-request-id", requestId);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return response;
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
