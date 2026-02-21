import {
  getSiteSettingsSnapshot,
  saveSiteSettingsConfig,
  siteSettingsConfigSchema,
} from "@/backend/composition/site-settings-store";
import {
  requireAdminPasswordRotation,
  requireAdminSession,
} from "@/backend/transport/rest/admin-auth";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import {
  jsonResponse,
  parseJsonBody,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = requireAdminSession(request, config);
    requireAdminPasswordRotation(session);

    const settings = await getSiteSettingsSnapshot();
    return jsonResponse(requestId, { data: settings });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = requireAdminSession(request, config);
    requireAdminPasswordRotation(session);

    const payload = await parseJsonBody(request, siteSettingsConfigSchema);
    const settings = await saveSiteSettingsConfig(payload);

    return jsonResponse(requestId, { data: settings });
  });
}
