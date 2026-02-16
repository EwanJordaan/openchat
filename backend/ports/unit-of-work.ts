import type { RepositoryBundle } from "@/backend/ports/repositories";

export interface UnitOfWork {
  run<T>(work: (repositories: RepositoryBundle) => Promise<T>): Promise<T>;
}
