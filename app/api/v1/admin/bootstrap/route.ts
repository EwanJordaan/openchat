import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { updateAdminSetupEnv } from "@/backend/composition/admin-setup-env";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import {
  jsonResponse,
  parseJsonBody,
} from "@/backend/transport/rest/pipeline";
import { ApiError } from "@/backend/transport/rest/api-error";

export const runtime = "nodejs";

const updateAdminBootstrapSchema = z.object({
  setupPassword: z.string().min(1).max(256),
  requiredAdminEmail: z.string().trim().toLowerCase().email(),
  nextSetupPassword: z.string().trim().min(8).max(256).optional(),
});

export async function POST(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const payload = await parseJsonBody(request, updateAdminBootstrapSchema);

    const configuredPassword = config.adminSetup.password;
    if (!configuredPassword) {
      throw new ApiError(
        503,
        "admin_setup_unavailable",
        "Admin bootstrap password is not configured. Set BACKEND_ADMIN_SETUP_PASSWORD first.",
      );
    }

    if (!constantTimeEqual(payload.setupPassword, configuredPassword)) {
      throw new ApiError(401, "invalid_setup_password", "Admin setup password is invalid");
    }

    const nextSetupPassword = payload.nextSetupPassword?.trim() || configuredPassword;
    const nextRequiredEmail = payload.requiredAdminEmail.trim().toLowerCase();

    const writeResult = await updateAdminSetupEnv({
      setupPassword: nextSetupPassword,
      requiredEmail: nextRequiredEmail,
    });

    process.env.BACKEND_ADMIN_SETUP_PASSWORD = nextSetupPassword;
    process.env.BACKEND_ADMIN_REQUIRED_EMAIL = nextRequiredEmail;

    return jsonResponse(requestId, {
      data: {
        requiredAdminEmail: nextRequiredEmail,
        setupPasswordUpdated: nextSetupPassword !== configuredPassword,
        envFilePath: writeResult.filePath,
      },
    });
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
