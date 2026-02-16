import { ZodError } from "zod";

import { AuthVerificationError } from "@/backend/adapters/auth/errors";
import { ApplicationError } from "@/backend/application/errors";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  const normalized = normalizeError(error);

  return Response.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
      requestId,
    },
    {
      status: normalized.status,
      headers: {
        "x-request-id": requestId,
      },
    },
  );
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ApplicationError) {
    return new ApiError(error.status, error.code, error.message);
  }

  if (error instanceof AuthVerificationError) {
    return new ApiError(401, error.code, error.message);
  }

  if (error instanceof ZodError) {
    return new ApiError(400, "invalid_request", "Request validation failed", error.issues);
  }

  if (error instanceof Error) {
    return new ApiError(500, "internal_error", error.message);
  }

  return new ApiError(500, "internal_error", "Unexpected server error");
}
