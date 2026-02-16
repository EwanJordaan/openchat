import { UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { User } from "@/backend/domain/user";
import type { UserRepository } from "@/backend/ports/repositories";

export interface UpdateCurrentUserProfileInput {
  name?: string | null;
}

export class UpdateCurrentUserProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(principal: Principal, input: UpdateCurrentUserProfileInput): Promise<User> {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const nextName = normalizeName(input.name);
    return this.users.updateProfile(principal.userId, {
      name: nextName,
    });
  }
}

function normalizeName(value: string | null | undefined): string | null {
  if (value === undefined) {
    throw new ValidationError("Profile update must include a name field");
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > 80) {
    throw new ValidationError("Name must be 80 characters or fewer");
  }

  return trimmed;
}
