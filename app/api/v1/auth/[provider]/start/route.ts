import { z } from "zod";

import {
  createAuthFlowCookie,
  createCodeChallengeS256,
  createNonceValue,
  createPkceCodeVerifier,
  createStateValue,
} from "@/backend/adapters/auth/cookie-session";
import { buildAuthorizationUrl, getInteractiveAuthIssuerByName } from "@/backend/adapters/auth/oidc-client";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

const modeSchema = z.enum(["login", "register"]);

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const { provider } = await context.params;
    const issuerConfig = getInteractiveAuthIssuerByName(container.config.auth.issuers, provider);
    if (!issuerConfig) {
      throw new ApiError(404, "provider_not_found", `Unknown auth provider: ${provider}`);
    }

    const url = new URL(request.url);
    const mode = modeSchema.parse(url.searchParams.get("mode") ?? "login");
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    const codeVerifier = createPkceCodeVerifier();
    const codeChallenge = createCodeChallengeS256(codeVerifier);
    const state = createStateValue();
    const nonce = createNonceValue();

    const redirectTo = await buildAuthorizationUrl({
      issuerConfig,
      mode,
      state,
      nonce,
      codeChallenge,
    });

    const flowCookie = createAuthFlowCookie(
      {
        providerName: issuerConfig.name,
        mode,
        returnTo,
        state,
        nonce,
        codeVerifier,
        createdAt: new Date().toISOString(),
      },
      container.config.session,
    );

    const headers = new Headers();
    headers.set("location", redirectTo.toString());
    headers.set("x-request-id", requestId);
    headers.append("set-cookie", flowCookie);

    return new Response(null, {
      status: 302,
      headers,
    });
  });
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw) {
    return "/";
  }

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
