import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";
import { listInteractiveAuthIssuers } from "@/backend/adapters/auth/oidc-client";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const providers = listInteractiveAuthIssuers(container.config.auth.issuers)
      .map((issuer) => ({
        name: issuer.name,
        issuer: issuer.issuer,
        loginUrl: `/api/v1/auth/${encodeURIComponent(issuer.name)}/start?mode=login`,
        registerUrl: `/api/v1/auth/${encodeURIComponent(issuer.name)}/start?mode=register`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse(requestId, { data: providers });
  });
}
