import { createClearedAdminSessionCookie } from "@/backend/adapters/auth/admin-session";
import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const response = jsonResponse(requestId, {
      data: {
        loggedOut: true,
      },
    });

    response.headers.append("set-cookie", createClearedAdminSessionCookie(container.config));
    return response;
  });
}
