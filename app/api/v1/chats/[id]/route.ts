import {
  handleApiRoute,
  jsonResponse,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id } = await context.params;
    await requirePermission(container, principal, "chat.read", {
      type: "chat",
      chatId: id,
    });

    const chat = await container.useCases.getChatById.execute(principal, id);
    return jsonResponse(requestId, { data: chat });
  });
}
