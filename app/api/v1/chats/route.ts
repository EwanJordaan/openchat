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

const createChatSchema = z.object({
  message: z.string().min(1).max(8000),
  modelProvider: z.enum(OPENCHAT_MODEL_PROVIDER_IDS).optional(),
});

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "chat.read", { type: "global" });

    const chats = await container.useCases.listChats.execute(principal);
    return jsonResponse(requestId, { data: chats });
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "chat.create", { type: "global" });

    const payload = await parseJsonBody(request, createChatSchema);
    const chat = await container.useCases.createChatFromFirstMessage.execute(principal, {
      ...payload,
      modelProvider: payload.modelProvider ?? container.config.ai.defaultModelProvider,
    });

    return jsonResponse(requestId, { data: chat }, 201);
  });
}
