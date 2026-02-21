import { z } from "zod";

import {
  getDefaultAdminUsername,
  isDefaultAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/backend/adapters/auth/admin-password";
import { createAdminSessionCookie } from "@/backend/adapters/auth/admin-session";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { ApiError } from "@/backend/transport/rest/api-error";
import { jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const adminLoginSchema = z.object({
  password: z.string().min(1).max(256),
  returnTo: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const payload = await parseJsonBody(request, adminLoginSchema);

    if (!verifyAdminPassword(payload.password, config.adminAuth.passwordHash)) {
      throw new ApiError(401, "invalid_credentials", "Invalid admin password");
    }

    const mustChangePassword =
      process.env.NODE_ENV === "production" &&
      isDefaultAdminPasswordConfigured(config.adminAuth.passwordHash);

    const sessionCookie = createAdminSessionCookie(
      {
        username: "admin",
        mustChangePassword,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
      config,
    );

    const response = jsonResponse(requestId, {
      data: {
        authenticated: true,
        username: getDefaultAdminUsername(),
        mustChangePassword,
        returnTo: sanitizeReturnTo(payload.returnTo ?? "/admin/dashboard"),
      },
    });
    response.headers.append("set-cookie", sessionCookie);

    return response;
  });
}

function sanitizeReturnTo(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/admin/dashboard";
  }

  return raw;
}
