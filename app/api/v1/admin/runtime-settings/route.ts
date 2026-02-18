import { z } from "zod";

import {
  applyRuntimeEnvPatchToProcessEnv,
  getRuntimeEnvSettingsFromEnv,
  updateRuntimeEnvSettings,
} from "@/backend/composition/runtime-env-settings";
import {
  requireAdminPasswordRotation,
  requireAdminSession,
} from "@/backend/transport/rest/admin-auth";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const runtimeSettingsSchema = z
  .object({
    database: z.object({
      adapter: z.enum(["postgres", "convex"]),
      databaseUrl: z.string().max(2048),
    }),
    auth: z.object({
      defaultProviderName: z.string().max(128),
      clockSkewSeconds: z.number().int().min(0).max(300),
      sessionSecureCookiesMode: z.enum(["auto", "true", "false"]),
      sessionCookieName: z.string().trim().min(1).max(128),
      flowCookieName: z.string().trim().min(1).max(128),
      issuersJson: z.string().max(250_000),
    }),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const session = requireAdminSession(request, container);
    requireAdminPasswordRotation(session);

    return jsonResponse(requestId, {
      data: {
        filePath: ".env",
        settings: getRuntimeEnvSettingsFromEnv(process.env),
      },
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    const session = requireAdminSession(request, container);
    requireAdminPasswordRotation(session);

    const payload = await parseJsonBody(request, runtimeSettingsSchema);

    if (payload.database.adapter === "postgres" && payload.database.databaseUrl.trim().length === 0) {
      throw new ApiError(400, "invalid_database_url", "DATABASE_URL is required when adapter is postgres");
    }

    let writeResult: Awaited<ReturnType<typeof updateRuntimeEnvSettings>>;
    try {
      writeResult = await updateRuntimeEnvSettings(payload);
    } catch (error) {
      if (error instanceof Error) {
        throw new ApiError(400, "invalid_runtime_settings", error.message);
      }

      throw error;
    }

    applyRuntimeEnvPatchToProcessEnv(writeResult.patch);

    return jsonResponse(requestId, {
      data: {
        filePath: writeResult.filePath,
        settings: getRuntimeEnvSettingsFromEnv(process.env),
      },
    });
  });
}
