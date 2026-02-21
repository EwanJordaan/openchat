import { z } from "zod";

import {
  enforceOpenRouterDailyRateLimit,
  resolveAiRequestPolicy,
} from "@/backend/transport/rest/ai-policy";
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

const createMessageSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.string().trim().min(1).max(200).optional(),
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
    const aiPolicy = resolveAiRequestPolicy({
      container,
      principal,
      requestedModel: payload.model,
    });

    await enforceOpenRouterDailyRateLimit({
      request,
      container,
      principal,
      role: aiPolicy.role,
      modelProvider: aiPolicy.modelProvider,
    });

    const chat = await container.useCases.appendChatMessage.execute(principal, {
      chatId: id,
      message: payload.message,
      modelProvider: aiPolicy.modelProvider,
      model: aiPolicy.model,
    });

    return jsonResponse(requestId, { data: chat });
  });
}
