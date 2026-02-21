import type { ZodType } from "zod";

import type { Principal } from "@/backend/domain/principal";
import type { AuthorizationResource } from "@/backend/ports/permission-checker";

import type { ApplicationContainer } from "@/backend/composition/container";
import { readSessionFromCookie } from "@/backend/adapters/auth/cookie-session";
import { resolvePrincipalFromLocalSession } from "@/backend/adapters/auth/local-auth";
import { getApplicationContainer } from "@/backend/composition/container";
import { ApiError, toErrorResponse } from "@/backend/transport/rest/api-error";

export interface ApiRequestContext {
  requestId: string;
  container: ApplicationContainer;
}

export async function handleApiRoute(
  request: Request,
  handler: (context: ApiRequestContext) => Promise<Response>,
): Promise<Response> {
  const requestId = getOrCreateRequestId(request);

  try {
    const response = await handler({
      requestId,
      container: getApplicationContainer(),
    });

    if (!response.headers.has("x-request-id")) {
      try {
        response.headers.set("x-request-id", requestId);
      } catch {
        const headers = new Headers(response.headers);
        headers.set("x-request-id", requestId);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return response;
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

export function jsonResponse(requestId: string, payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}

export async function requirePrincipal(
  request: Request,
  container: ApplicationContainer,
): Promise<Principal> {
  let authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader) {
    const browserSession = readSessionFromCookie(request.headers.get("cookie"), container.config.session);
    if (browserSession?.accessToken) {
      authorizationHeader = `Bearer ${browserSession.accessToken}`;
    }
  }

  const principal = await container.authContextProvider.getPrincipal(authorizationHeader);

  if (principal) {
    return principal;
  }

  const localPrincipal = await resolvePrincipalFromLocalSession(request, container);
  if (localPrincipal) {
    return localPrincipal;
  }

  throw new ApiError(401, "unauthorized", "Missing or invalid authentication session");
}

export async function requirePermission(
  container: ApplicationContainer,
  principal: Principal,
  action: string,
  resource?: AuthorizationResource,
): Promise<void> {
  const allowed = await container.permissionChecker.can(principal, action, resource);

  if (!allowed) {
    throw new ApiError(403, "forbidden", `Permission denied for action '${action}'`);
  }
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }

  return schema.parse(body);
}

export function getOrCreateRequestId(request: Request): string {
  const requestId = request.headers.get("x-request-id")?.trim();
  if (requestId) {
    return requestId;
  }

  return crypto.randomUUID();
}
