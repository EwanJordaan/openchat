import { z } from "zod";

import {
  getProviderApiKeysStatusFromEnv,
  updateProviderApiKeysEnv,
} from "@/backend/composition/provider-api-keys-env";
import {
  requireAdminPasswordRotation,
  requireAdminSession,
} from "@/backend/transport/rest/admin-auth";
import { handleAdminApiRoute } from "@/backend/transport/rest/admin-pipeline";
import { ApiError } from "@/backend/transport/rest/api-error";
import { jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const updateApiKeysSchema = z
  .object({
    openrouterApiKey: z.string().trim().max(512).nullable().optional(),
    openaiApiKey: z.string().trim().max(512).nullable().optional(),
    anthropicApiKey: z.string().trim().max(512).nullable().optional(),
    geminiApiKey: z.string().trim().max(512).nullable().optional(),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = requireAdminSession(request, config);
    requireAdminPasswordRotation(session);

    return jsonResponse(requestId, {
      data: {
        keys: getProviderApiKeysStatusFromEnv(process.env),
      },
    });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return handleAdminApiRoute(request, async ({ config, requestId }) => {
    const session = requireAdminSession(request, config);
    requireAdminPasswordRotation(session);

    const payload = await parseJsonBody(request, updateApiKeysSchema);
    const normalized = normalizeApiKeysUpdate(payload);

    if (Object.keys(normalized).length === 0) {
      throw new ApiError(
        400,
        "invalid_request",
        "Provide at least one API key update or clear operation",
      );
    }

    const writeResult = await updateProviderApiKeysEnv(normalized);
    hydrateProcessEnv(normalized);

    return jsonResponse(requestId, {
      data: {
        envFilePath: writeResult.filePath,
        keys: getProviderApiKeysStatusFromEnv(process.env),
      },
    });
  });
}

type ApiKeyField = "openrouterApiKey" | "openaiApiKey" | "anthropicApiKey" | "geminiApiKey";

function normalizeApiKeysUpdate(input: z.infer<typeof updateApiKeysSchema>) {
  const output: {
    [key in ApiKeyField]?: string | null;
  } = {};

  for (const key of [
    "openrouterApiKey",
    "openaiApiKey",
    "anthropicApiKey",
    "geminiApiKey",
  ] as const) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      output[key] = null;
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    output[key] = trimmed;
  }

  return output;
}

function hydrateProcessEnv(update: {
  openrouterApiKey?: string | null;
  openaiApiKey?: string | null;
  anthropicApiKey?: string | null;
  geminiApiKey?: string | null;
}): void {
  if (update.openrouterApiKey !== undefined) {
    if (update.openrouterApiKey === null) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = update.openrouterApiKey;
    }
  }

  if (update.openaiApiKey !== undefined) {
    if (update.openaiApiKey === null) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = update.openaiApiKey;
    }
  }

  if (update.anthropicApiKey !== undefined) {
    if (update.anthropicApiKey === null) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = update.anthropicApiKey;
    }
  }

  if (update.geminiApiKey !== undefined) {
    if (update.geminiApiKey === null) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = update.geminiApiKey;
    }
  }
}
