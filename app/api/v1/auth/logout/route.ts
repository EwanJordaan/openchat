import {
  createClearedAuthFlowCookie,
  createClearedSessionCookie,
} from "@/backend/adapters/auth/cookie-session";
import {
  createClearedLocalAuthSessionCookie,
  readLocalAuthSessionFromCookie,
} from "@/backend/adapters/auth/local-session";
import type { ApplicationContainer } from "@/backend/composition/container";
import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    await revokeLocalSessionIfPresent(request, container);

    const response = jsonResponse(requestId, {
      data: {
        loggedOut: true,
      },
    });

    response.headers.append("set-cookie", createClearedSessionCookie(container.config.session));
    response.headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));
    response.headers.append("set-cookie", createClearedLocalAuthSessionCookie(container.config));

    return response;
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    await revokeLocalSessionIfPresent(request, container);

    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    const headers = new Headers();
    headers.set("location", new URL(returnTo, request.url).toString());
    headers.set("x-request-id", requestId);
    headers.append("set-cookie", createClearedSessionCookie(container.config.session));
    headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));
    headers.append("set-cookie", createClearedLocalAuthSessionCookie(container.config));

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

async function revokeLocalSessionIfPresent(
  request: Request,
  container: ApplicationContainer,
): Promise<void> {
  if (!container.config.auth.local.enabled) {
    return;
  }

  const localSession = readLocalAuthSessionFromCookie(request.headers.get("cookie"), container.config);
  if (!localSession) {
    return;
  }

  await container.unitOfWork.run(async ({ localAuth }) => {
    await localAuth.revokeSession(localSession.sessionId);
  });
}
