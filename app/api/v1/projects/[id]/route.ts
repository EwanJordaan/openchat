import { handleApiRoute, jsonResponse, requirePermission, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "project.read", { type: "project" });

    const { id } = await context.params;
    const project = await container.useCases.getProjectById.execute(principal, id);
    return jsonResponse(requestId, { data: project });
  });
}
