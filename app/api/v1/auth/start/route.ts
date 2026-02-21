import { z } from "zod";

import {
  getDefaultInteractiveAuthIssuer,
  getInteractiveAuthIssuerByName,
} from "@/backend/adapters/auth/oidc-client";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const modeSchema = z.enum(["login", "register"]);

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const url = new URL(request.url);
    const mode = modeSchema.parse(url.searchParams.get("mode") ?? "login");
    const providerName = parseProviderName(url.searchParams.get("provider"));
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    const provider = providerName
      ? getInteractiveAuthIssuerByName(container.config.auth.issuers, providerName)
      : getDefaultInteractiveAuthIssuer(
          container.config.auth.issuers,
          container.config.auth.defaultProviderName,
        );
    if (!provider) {
      if (providerName) {
        throw new ApiError(404, "provider_not_found", `Unknown auth provider: ${providerName}`);
      }

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

function parseProviderName(raw: string | null): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError(400, "invalid_provider", "Provider must contain only letters, numbers, underscores, and dashes");
  }

  return value;
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
