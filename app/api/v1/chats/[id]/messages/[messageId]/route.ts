import {
  handleApiRoute,
  jsonResponse,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id: chatId, messageId } = await context.params;
    await requirePermission(container, principal, "chat.message.delete", {
      type: "chat",
      chatId,
    });

    const updated = await container.useCases.deleteChatMessage.execute(principal, {
      chatId,
      messageId,
    });

    return jsonResponse(requestId, { data: updated });
  });
}
