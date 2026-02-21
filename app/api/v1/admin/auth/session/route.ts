import { readAdminSessionFromCookie } from "@/backend/adapters/auth/admin-session";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = readAdminSessionFromCookie(request.headers.get("cookie"), config);

    return jsonResponse(requestId, {
      data: {
        authenticated: Boolean(session),
        mustChangePassword: session?.mustChangePassword ?? false,
      },
    });
  });
}
