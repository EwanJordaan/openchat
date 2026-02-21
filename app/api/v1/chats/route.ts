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

const createChatSchema = z.object({
  message: z.string().min(1).max(8000),
  model: z.string().trim().min(1).max(200).optional(),
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

    const chat = await container.useCases.createChatFromFirstMessage.execute(principal, {
      message: payload.message,
      modelProvider: aiPolicy.modelProvider,
      model: aiPolicy.model,
    });

    return jsonResponse(requestId, { data: chat }, 201);
  });
}
