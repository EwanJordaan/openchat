import { handleApiRoute, jsonResponse, requirePermission, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "user.read.self", {
      type: "user",
      userId: principal.userId,
    });

    const currentUser = await container.useCases.getCurrentUser.execute(principal);
    return jsonResponse(requestId, { data: currentUser });
  });
}
