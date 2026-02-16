import { z } from "zod";

import {
  handleApiRoute,
  jsonResponse,
  parseJsonBody,
  requirePermission,
  requirePrincipal,
} from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  name: z.string().max(80).nullable(),
});

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

export async function PATCH(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "user.update.self", {
      type: "user",
      userId: principal.userId,
    });

    const payload = await parseJsonBody(request, updateProfileSchema);
    const user = await container.useCases.updateCurrentUserProfile.execute(principal, payload);

    return jsonResponse(requestId, {
      data: {
        user: {
          ...user,
          hasAvatar: Boolean(user.avatarMimeType),
        },
      },
    });
  });
}
