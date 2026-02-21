import { z } from "zod";

import {
  handleApiRoute,
  jsonResponse,
  parseJsonBody,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateChatSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((payload) => payload.title !== undefined || payload.isPinned !== undefined || payload.isArchived !== undefined, {
    message: "At least one update field is required",
  });

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

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id } = await context.params;
    await requirePermission(container, principal, "chat.update", {
      type: "chat",
      chatId: id,
    });

    const payload = await parseJsonBody(request, updateChatSchema);
    const updated = await container.useCases.updateChat.execute(principal, {
      chatId: id,
      title: payload.title,
      isPinned: payload.isPinned,
      isArchived: payload.isArchived,
    });

    return jsonResponse(requestId, { data: updated });
  });
}
