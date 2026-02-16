import {
  createClearedAuthFlowCookie,
  createClearedSessionCookie,
} from "@/backend/adapters/auth/cookie-session";
import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const response = jsonResponse(requestId, {
      data: {
        loggedOut: true,
      },
    });

    response.headers.append("set-cookie", createClearedSessionCookie(container.config.session));
    response.headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));

    return response;
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

    const response = Response.redirect(new URL(returnTo, request.url), 302);
    response.headers.append("set-cookie", createClearedSessionCookie(container.config.session));
    response.headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));
    response.headers.set("x-request-id", requestId);

    return response;
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
