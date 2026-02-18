import { z } from "zod";

import { getDefaultInteractiveAuthIssuer } from "@/backend/adapters/auth/oidc-client";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const modeSchema = z.enum(["login", "register"]);

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const url = new URL(request.url);
    const mode = modeSchema.parse(url.searchParams.get("mode") ?? "login");
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    const provider = getDefaultInteractiveAuthIssuer(
      container.config.auth.issuers,
      container.config.auth.defaultProviderName,
    );
    if (!provider) {
      throw new ApiError(503, "no_auth_provider_configured", "No interactive auth provider is configured");
    }

    const redirectTarget = new URL(
      `/api/v1/auth/${encodeURIComponent(provider.name)}/start?mode=${encodeURIComponent(mode)}&returnTo=${encodeURIComponent(returnTo)}`,
      request.url,
    );

    const headers = new Headers();
    headers.set("location", redirectTarget.toString());
    headers.set("x-request-id", requestId);

    return new Response(null, {
      status: 302,
      headers,
    });
  });
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
