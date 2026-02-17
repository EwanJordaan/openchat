import {
  getSiteSettingsSnapshot,
  saveSiteSettingsConfig,
  siteSettingsConfigSchema,
} from "@/backend/composition/site-settings-store";
import {
  handleApiRoute,
  jsonResponse,
  parseJsonBody,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "admin.settings.manage", { type: "global" });

    const settings = await getSiteSettingsSnapshot();
    return jsonResponse(requestId, { data: settings });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "admin.settings.manage", { type: "global" });

    const payload = await parseJsonBody(request, siteSettingsConfigSchema);
    const settings = await saveSiteSettingsConfig(payload);

    return jsonResponse(requestId, { data: settings });
  });
}
