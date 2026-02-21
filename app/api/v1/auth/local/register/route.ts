import { z } from "zod";

import {
  LocalAuthFailure,
  registerWithLocalAuth,
} from "@/backend/adapters/auth/local-auth";
import { validateLocalPassword } from "@/backend/adapters/auth/local-password";
import {
  createClearedAuthFlowCookie,
  createClearedSessionCookie,
} from "@/backend/adapters/auth/cookie-session";
import { createLocalAuthSessionCookie } from "@/backend/adapters/auth/local-session";
import { ApiError } from "@/backend/transport/rest/api-error";
import { handleApiRoute, jsonResponse, parseJsonBody } from "@/backend/transport/rest/pipeline";

export const runtime = "nodejs";

const registerSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(256),
    name: z.string().trim().max(80).optional(),
    returnTo: z.string().optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  return handleApiRoute(request, async ({ container, requestId }) => {
    if (!container.config.auth.local.enabled) {
      throw new ApiError(404, "local_auth_disabled", "Local auth is disabled");
    }

    const payload = await parseJsonBody(request, registerSchema);
    const passwordValidationError = validateLocalPassword(payload.password);
    if (passwordValidationError) {
      throw new ApiError(400, "invalid_password", passwordValidationError);
    }

    try {
      const result = await registerWithLocalAuth(container, {
        email: payload.email,
        password: payload.password,
        name: payload.name,
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
      if (error instanceof LocalAuthFailure && error.code === "email_taken") {
        throw new ApiError(409, error.code, error.message);
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
