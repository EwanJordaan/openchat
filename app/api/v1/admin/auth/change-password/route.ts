import { z } from "zod";

import {
  hashAdminPassword,
  validateNewAdminPassword,
  verifyAdminPassword,
} from "@/backend/adapters/auth/admin-password";
import {
  createAdminSessionCookie,
  readAdminSessionFromCookie,
} from "@/backend/adapters/auth/admin-session";
import { updateAdminAuthEnv } from "@/backend/composition/admin-auth-env";
import { requireAdminSession } from "@/backend/transport/rest/admin-auth";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { ApiError } from "@/backend/transport/rest/api-error";
import { jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  nextPassword: z.string().min(1).max(256),
});

export async function POST(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    requireAdminSession(request, config);

    const payload = await parseJsonBody(request, changePasswordSchema);

    if (!verifyAdminPassword(payload.currentPassword, config.adminAuth.passwordHash)) {
      throw new ApiError(401, "invalid_current_password", "Current password is incorrect");
    }

    const passwordPolicyError = validateNewAdminPassword(payload.nextPassword);
    if (passwordPolicyError) {
      throw new ApiError(400, "invalid_password", passwordPolicyError);
    }

    const nextHash = hashAdminPassword(payload.nextPassword.trim());
    const writeResult = await updateAdminAuthEnv({
      passwordHash: nextHash,
    });

    process.env.BACKEND_ADMIN_PASSWORD_HASH = nextHash;

    const currentSession = readAdminSessionFromCookie(request.headers.get("cookie"), config);
    const refreshedCookie = createAdminSessionCookie(
      {
        username: "admin",
        mustChangePassword: false,
        issuedAt: new Date().toISOString(),
        expiresAt: currentSession?.expiresAt ?? new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
      config,
    );

    const response = jsonResponse(requestId, {
      data: {
        passwordUpdated: true,
        envFilePath: writeResult.filePath,
      },
    });
    response.headers.append("set-cookie", refreshedCookie);
    return response;
  });
}
