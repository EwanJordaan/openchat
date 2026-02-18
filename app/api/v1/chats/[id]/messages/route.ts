import { z } from "zod";

import {
  handleApiRoute,
  jsonResponse,
  parseJsonBody,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";
import { OPENCHAT_MODEL_PROVIDER_IDS } from "@/shared/model-providers";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createMessageSchema = z.object({
  message: z.string().min(1).max(8000),
  modelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);

    const { id } = await context.params;
    await requirePermission(container, principal, "chat.message.create", {
      type: "chat",
      chatId: id,
    });

    const payload = await parseJsonBody(request, createMessageSchema);
    const chat = await container.useCases.appendChatMessage.execute(principal, {
      chatId: id,
      message: payload.message,
      modelProvider: payload.modelProvider ?? container.config.ai.defaultModelProvider,
    });

    return jsonResponse(requestId, { data: chat });
  });
}
