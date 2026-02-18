import { z } from "zod";

import {
  getDefaultAdminUsername,
  isDefaultAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/backend/adapters/auth/admin-password";
import { createAdminSessionCookie } from "@/backend/adapters/auth/admin-session";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const adminLoginSchema = z.object({
  password: z.string().min(1).max(256),
  returnTo: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const payload = await parseJsonBody(request, adminLoginSchema);

    if (!verifyAdminPassword(payload.password, container.config.adminAuth.passwordHash)) {
      throw new ApiError(401, "invalid_credentials", "Invalid admin password");
    }

    const mustChangePassword =
      process.env.NODE_ENV === "production" &&
      isDefaultAdminPasswordConfigured(container.config.adminAuth.passwordHash);

    const sessionCookie = createAdminSessionCookie(
      {
        username: "admin",
        mustChangePassword,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
      container.config,
    );

    const response = jsonResponse(requestId, {
      data: {
        authenticated: true,
        username: getDefaultAdminUsername(),
        mustChangePassword,
        returnTo: sanitizeReturnTo(payload.returnTo ?? "/admin/settings"),
      },
    });
    response.headers.append("set-cookie", sessionCookie);

    return response;
  });
}

function sanitizeReturnTo(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/admin/settings";
  }

  return raw;
}
