import { UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { UserAvatar, UserRepository } from "@/backend/ports/repositories";

export class GetCurrentUserAvatarUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(principal: Principal): Promise<UserAvatar | null> {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    return this.users.getAvatar(principal.userId);
  }
}
