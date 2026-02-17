import { z } from "zod";

import { handleApiRoute, jsonResponse, parseJsonBody, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const createChatSchema = z.object({
  message: z.string().min(1).max(8000),
});

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const chats = await container.useCases.listChats.execute(principal);
    return jsonResponse(requestId, { data: chats });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const payload = await parseJsonBody(request, createChatSchema);
    const chat = await container.useCases.createChatFromFirstMessage.execute(principal, payload);

    return jsonResponse(requestId, { data: chat }, 201);
  });
}
