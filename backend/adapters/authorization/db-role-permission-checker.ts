import type { Principal } from "@/backend/domain/principal";
import type { AuthorizationResource, PermissionChecker } from "@/backend/ports/permission-checker";

const MEMBER_ACTIONS = new Set([
  "project.read",
  "project.create",
]);

const AUTHENTICATED_ACTIONS = new Set([
  "chat.read",
  "chat.create",
  "chat.update",
  "chat.message.create",
  "chat.message.delete",
]);

export class DbRolePermissionChecker implements PermissionChecker {
  async can(
    principal: Principal,
    action: string,
    resource?: AuthorizationResource,
  ): Promise<boolean> {
    void resource;

    if (!principal.userId) {
      return false;
    }

    const roles = new Set(principal.roles);

    if (roles.has("admin")) {
      return true;
    }

    if (action === "user.read.self") {
      return true;
    }

    if (action === "user.update.self") {
      return true;
    }

    if (AUTHENTICATED_ACTIONS.has(action)) {
      return true;
    }

    if (!roles.has("member")) {
      return false;
    }

    return MEMBER_ACTIONS.has(action);
  }
}
