import {
  getSiteSettingsSnapshot,
  saveSiteSettingsConfig,
  siteSettingsConfigSchema,
} from "@/backend/composition/site-settings-store";
import {
  requireAdminPasswordRotation,
  requireAdminSession,
} from "@/backend/transport/rest/admin-auth";
import {
  handleApiRoute,
  jsonResponse,
  parseJsonBody,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const session = requireAdminSession(request, container);
    requireAdminPasswordRotation(session);

    const settings = await getSiteSettingsSnapshot();
    return jsonResponse(requestId, { data: settings });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const session = requireAdminSession(request, container);
    requireAdminPasswordRotation(session);

    const payload = await parseJsonBody(request, siteSettingsConfigSchema);
    const settings = await saveSiteSettingsConfig(payload);

    return jsonResponse(requestId, { data: settings });
  });
}
