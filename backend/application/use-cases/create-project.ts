import { UnauthorizedError, ValidationError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

export interface CreateProjectInput {
  name: string;
}

export class CreateProjectUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(principal: Principal, input: CreateProjectInput) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const name = input.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new ValidationError("Project name must be between 2 and 120 characters");
    }

    return this.unitOfWork.run(async ({ projects }) => {
      return projects.createProject({
        id: crypto.randomUUID(),
        ownerUserId: principal.userId as string,
        name,
      });
    });
  }
}
