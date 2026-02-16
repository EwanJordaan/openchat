import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, requirePermission, requirePrincipal } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "user.read.self", {
      type: "user",
      userId: principal.userId,
    });

    const avatar = await container.useCases.getCurrentUserAvatar.execute(principal);
    if (!avatar) {
      throw new ApiError(404, "avatar_not_found", "No custom avatar is set for this account");
    }

    const body = new Blob([Uint8Array.from(avatar.bytes)], {
      type: avatar.mimeType,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": avatar.mimeType,
        "cache-control": "private, max-age=60",
        "x-request-id": requestId,
      },
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "user.update.self", {
      type: "user",
      userId: principal.userId,
    });

    const formData = await request.formData();
    const avatarFile = formData.get("avatar");
    if (!(avatarFile instanceof File)) {
      throw new ApiError(400, "invalid_avatar", "Expected multipart field 'avatar' with an image file");
    }

    const bytes = new Uint8Array(await avatarFile.arrayBuffer());
    const user = await container.useCases.uploadCurrentUserAvatar.execute(principal, {
      mimeType: avatarFile.type,
      bytes,
    });

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

export async function DELETE(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const principal = await requirePrincipal(request, container);
    await requirePermission(container, principal, "user.update.self", {
      type: "user",
      userId: principal.userId,
    });

    const user = await container.useCases.removeCurrentUserAvatar.execute(principal);

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
