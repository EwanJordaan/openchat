import { z } from "zod";

import { handleApiRoute, jsonResponse, parseJsonBody, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createMessageSchema = z.object({
  message: z.string().min(1).max(8000),
});

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id } = await context.params;

    const payload = await parseJsonBody(request, createMessageSchema);
    const chat = await container.useCases.appendChatMessage.execute(principal, {
      chatId: id,
      message: payload.message,
    });

    return jsonResponse(requestId, { data: chat });
  });
}
