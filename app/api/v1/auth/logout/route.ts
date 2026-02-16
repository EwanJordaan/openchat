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

    const headers = new Headers();
    headers.set("location", new URL(returnTo, request.url).toString());
    headers.set("x-request-id", requestId);
    headers.append("set-cookie", createClearedSessionCookie(container.config.session));
    headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));

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
