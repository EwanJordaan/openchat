import type { RepositoryBundle } from "@/backend/ports/repositories";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

export function createConvexRepositories(): RepositoryBundle {
  throw new Error("Convex adapter is not implemented yet");
}

export class ConvexUnitOfWork implements UnitOfWork {
  async run<T>(work: Parameters<UnitOfWork["run"]>[0]): Promise<T> {
    void work;
    throw new Error("Convex unit of work is not implemented yet");
  }
}
