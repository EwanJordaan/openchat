import { UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { User } from "@/backend/domain/user";
import type { UserRepository } from "@/backend/ports/repositories";

export class RemoveCurrentUserAvatarUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(principal: Principal): Promise<User> {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    return this.users.clearAvatar(principal.userId);
  }
}
