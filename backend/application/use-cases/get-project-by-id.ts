import { NotFoundError, UnauthorizedError } from "@/backend/application/errors";
import type { Principal } from "@/backend/domain/principal";
import type { ProjectRepository } from "@/backend/ports/repositories";

export class GetProjectByIdUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(principal: Principal, projectId: string) {
    if (!principal.userId) {
      throw new UnauthorizedError("Authenticated principal is not linked to a user");
    }

    const project = await this.projects.getByIdForUser(projectId, principal.userId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    return project;
  }
}
