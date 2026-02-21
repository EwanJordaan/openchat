import { createClearedAdminSessionCookie } from "@/backend/adapters/auth/admin-session";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const response = jsonResponse(requestId, {
      data: {
        loggedOut: true,
      },
    });

    response.headers.append("set-cookie", createClearedAdminSessionCookie(config));
    return response;
  });
}
