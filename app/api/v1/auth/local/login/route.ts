import { z } from "zod";

import {
  LocalAuthFailure,
  loginWithLocalAuth,
} from "@/backend/adapters/auth/local-auth";
import {
  createClearedAuthFlowCookie,
  createClearedSessionCookie,
} from "@/backend/adapters/auth/cookie-session";
import { createLocalAuthSessionCookie } from "@/backend/adapters/auth/local-session";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const loginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(256),
    returnTo: z.string().optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    if (!container.config.auth.local.enabled) {
      throw new ApiError(404, "local_auth_disabled", "Local auth is disabled");
    }

    const payload = await parseJsonBody(request, loginSchema);

    try {
      const result = await loginWithLocalAuth(container, {
        email: payload.email,
        password: payload.password,
      });

      const response = jsonResponse(requestId, {
        data: {
          authenticated: true,
          redirectTo: sanitizeReturnTo(payload.returnTo),
        },
      });

      response.headers.append(
        "set-cookie",
        createLocalAuthSessionCookie(
          {
            sessionId: result.sessionId,
            expiresAt: result.expiresAt,
          },
          container.config,
        ),
      );
      response.headers.append("set-cookie", createClearedSessionCookie(container.config.session));
      response.headers.append("set-cookie", createClearedAuthFlowCookie(container.config.session));

      return response;
    } catch (error) {
      if (error instanceof LocalAuthFailure && error.code === "invalid_credentials") {
        throw new ApiError(401, error.code, error.message);
      }

      throw error;
    }
  });
}

function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
