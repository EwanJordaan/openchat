import type { Principal } from "@/backend/domain/principal";

export type AuthorizationResource =
  | { type: "global" }
  | { type: "user"; userId?: string }
  | { type: "project"; projectId?: string }
  | { type: "chat"; chatId?: string };

export interface PermissionChecker {
  can(
    principal: Principal,
    action: string,
    resource?: AuthorizationResource,
  ): Promise<boolean>;
}
