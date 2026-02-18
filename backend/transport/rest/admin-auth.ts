import { readAdminSessionFromCookie, type AdminSession } from "@/backend/adapters/auth/admin-session";
import type { ApplicationContainer } from "@/backend/composition/container";
import { ApiError } from "@/backend/transport/rest/api-error";

export function requireAdminSession(request: Request, container: ApplicationContainer): AdminSession {
  const session = readAdminSessionFromCookie(request.headers.get("cookie"), container.config);
  if (!session) {
    throw new ApiError(401, "admin_unauthorized", "Admin authentication is required");
  }

  return session;
}

export function requireAdminPasswordRotation(session: AdminSession): void {
  if (session.mustChangePassword) {
    throw new ApiError(
      403,
      "admin_password_change_required",
      "Change the default admin password before managing admin settings",
    );
  }
}
