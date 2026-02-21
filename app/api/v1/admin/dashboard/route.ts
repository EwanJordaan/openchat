import { getAdminDashboardStatus } from "@/backend/composition/admin-dashboard-status";
import {
  requireAdminPasswordRotation,
  requireAdminSession,
} from "@/backend/transport/rest/admin-auth";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { jsonResponse } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = requireAdminSession(request, config);
    requireAdminPasswordRotation(session);

    const status = await getAdminDashboardStatus(process.env);

    return jsonResponse(requestId, {
      data: {
        envFilePath: ".env",
        ...status,
      },
    });
  });
}
