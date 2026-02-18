import { readAdminSessionFromCookie } from "@/backend/adapters/auth/admin-session";
import { handleApiRoute, jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const session = readAdminSessionFromCookie(request.headers.get("cookie"), container.config);

    return jsonResponse(requestId, {
      data: {
        authenticated: Boolean(session),
        mustChangePassword: session?.mustChangePassword ?? false,
      },
    });
  });
}
