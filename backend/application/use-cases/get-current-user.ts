import { NotFoundError, UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { UserRepository } from "@/backend/ports/repositories";

export interface CurrentUserView {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarMimeType: string | null;
    avatarUpdatedAt: string | null;
    hasAvatar: boolean;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
  };
  principal: {
    subject: string;
    issuer: string;
    providerName?: string;
    authMethod?: "oidc";
    orgId?: string;
    roles: string[];
    permissions: string[];
  };
}

export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(principal: Principal): Promise<CurrentUserView> {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const user = await this.users.getById(principal.userId);
    if (!user) {
      throw new NotFoundError("User for this identity was not found");
    }

    return {
      user: {
        ...user,
        hasAvatar: Boolean(user.avatarMimeType),
      },
      principal: {
        subject: principal.subject,
        issuer: principal.issuer,
        providerName: principal.providerName,
        authMethod: principal.authMethod,
        orgId: principal.orgId,
        roles: principal.roles,
        permissions: principal.permissions,
      },
    };
  }
}
