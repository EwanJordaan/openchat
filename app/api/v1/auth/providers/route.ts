import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";
import { listInteractiveAuthIssuers } from "@/backend/adapters/auth/oidc-client";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const redirectProviders = listInteractiveAuthIssuers(container.config.auth.issuers)
      .map((issuer) => ({
        name: issuer.name,
        issuer: issuer.issuer,
        mode: "redirect" as const,
        loginUrl: `/api/v1/auth/${encodeURIComponent(issuer.name)}/start?mode=login`,
        registerUrl: `/api/v1/auth/${encodeURIComponent(issuer.name)}/start?mode=register`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const providers = container.config.auth.local.enabled
      ? [
          {
            name: "local",
            issuer: "local",
            mode: "credentials" as const,
            loginUrl: "/api/v1/auth/local/login",
            registerUrl: "/api/v1/auth/local/register",
          },
          ...redirectProviders,
        ]
      : redirectProviders;

    return jsonResponse(requestId, { data: providers });
  });
}
