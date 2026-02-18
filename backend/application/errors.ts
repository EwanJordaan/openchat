export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = "Authentication is required") {
    super("unauthorized", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "You do not have access to this resource") {
    super("forbidden", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "Resource not found") {
    super("not_found", message, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super("validation_error", message, 400);
    this.name = "ValidationError";
  }
}

export class UpstreamServiceError extends ApplicationError {
  constructor(message = "Upstream provider request failed") {
    super("upstream_error", message, 502);
    this.name = "UpstreamServiceError";
  }
}
