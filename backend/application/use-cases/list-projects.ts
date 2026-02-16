import { UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ProjectRepository } from "@/backend/ports/repositories";

export class ListProjectsUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(principal: Principal) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    return this.projects.listForUser(principal.userId);
  }
}
