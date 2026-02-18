import { decodeJwt } from "jose";

import {
  createClearedAuthFlowCookie,
  createSessionCookie,
  readAuthFlowFromCookie,
} from "@/backend/adapters/auth/cookie-session";
import { exchangeAuthorizationCode, getInteractiveAuthIssuerByName } from "@/backend/adapters/auth/oidc-client";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const { provider } = await context.params;
    const issuerConfig = getInteractiveAuthIssuerByName(container.config.auth.issuers, provider);
    if (!issuerConfig) {
      throw new ApiError(404, "provider_not_found", `Unknown auth provider: ${provider}`);
    }

    const url = new URL(request.url);
    const callbackError = url.searchParams.get("error");
    if (callbackError) {
      const description = url.searchParams.get("error_description") ?? "Authorization request failed";
      throw new ApiError(401, "auth_callback_error", `${callbackError}: ${description}`);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      throw new ApiError(400, "invalid_callback", "Callback is missing required code or state");
    }

    const flow = readAuthFlowFromCookie(request.headers.get("cookie"), container.config.session);
    if (!flow) {
      throw new ApiError(401, "auth_flow_missing", "Authentication flow state is missing or expired");
    }

    if (flow.providerName !== issuerConfig.name) {
      throw new ApiError(401, "provider_mismatch", "Auth provider in callback does not match flow state");
    }

    if (flow.state !== state) {
      throw new ApiError(401, "state_mismatch", "State does not match the active auth flow");
    }

    const tokens = await exchangeAuthorizationCode({
      issuerConfig,
      code,
      codeVerifier: flow.codeVerifier,
    });

    const jwtForSession = resolveJwtForSession(tokens.accessToken, tokens.idToken, issuerConfig.tokenUse);

    const principal = await container.authContextProvider.getPrincipal(`Bearer ${jwtForSession}`);
    if (!principal) {
      throw new ApiError(401, "invalid_token", "Token did not resolve to an authenticated principal");
    }

    const sessionCookie = createSessionCookie(
      {
        accessToken: jwtForSession,
        providerName: issuerConfig.name,
        expiresAt: resolveSessionExpiry(jwtForSession, tokens.expiresInSeconds),
      },
      container.config.session,
    );

    const clearFlowCookie = createClearedAuthFlowCookie(container.config.session);
    const redirectTo = new URL(sanitizeReturnTo(flow.returnTo), request.url).toString();

    const headers = new Headers();
    headers.set("location", redirectTo);
    headers.set("x-request-id", requestId);
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", clearFlowCookie);

    return new Response(null, {
      status: 302,
      headers,
    });
  });
}

function resolveJwtForSession(
  accessToken: string | undefined,
  idToken: string | undefined,
  tokenUse: "access" | "id" | "any",
): string {
  if (tokenUse === "id") {
    if (!idToken) {
      throw new ApiError(401, "missing_id_token", "Provider callback did not include an id_token");
    }

    return idToken;
  }

  if (tokenUse === "access") {
    if (!accessToken) {
      throw new ApiError(401, "missing_access_token", "Provider callback did not include an access_token");
    }

    return accessToken;
  }

  if (accessToken) {
    return accessToken;
  }

  if (idToken) {
    return idToken;
  }

  throw new ApiError(401, "missing_token", "Provider callback did not include a usable token");
}

function resolveSessionExpiry(accessToken: string, expiresInSeconds: number | undefined): string {
  if (expiresInSeconds && Number.isFinite(expiresInSeconds)) {
    return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  }

  try {
    const payload = decodeJwt(accessToken);
    if (typeof payload.exp === "number") {
      return new Date(payload.exp * 1000).toISOString();
    }
  } catch {
    // If decoding fails, fall back to a short-lived session.
  }

  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function sanitizeReturnTo(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
