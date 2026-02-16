import { CreateProjectUseCase } from "@/backend/application/use-cases/create-project";
import { GetCurrentUserUseCase } from "@/backend/application/use-cases/get-current-user";
import { GetProjectByIdUseCase } from "@/backend/application/use-cases/get-project-by-id";
import { ListProjectsUseCase } from "@/backend/application/use-cases/list-projects";
import { JitProvisioningAuthContextProvider } from "@/backend/adapters/auth/jit-provisioning-auth-context-provider";
import { JwtMultiIssuerVerifier } from "@/backend/adapters/auth/jwt-multi-issuer-verifier";
import { DbRolePermissionChecker } from "@/backend/adapters/authorization/db-role-permission-checker";
import { createPostgresRepositories } from "@/backend/adapters/db/postgres/repository-factory";
import { getPostgresPool } from "@/backend/adapters/db/postgres/client";
import { PostgresUnitOfWork } from "@/backend/adapters/db/postgres/unit-of-work";
import type { AuthContextProvider } from "@/backend/ports/auth-context-provider";
import type { PermissionChecker } from "@/backend/ports/permission-checker";
import type { RepositoryBundle } from "@/backend/ports/repositories";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

import { loadBackendConfig, type BackendConfig } from "@/backend/composition/config";

export interface ApplicationContainer {
  config: BackendConfig;
  authContextProvider: AuthContextProvider;
  permissionChecker: PermissionChecker;
  repositories: RepositoryBundle;
  unitOfWork: UnitOfWork;
  useCases: {
    getCurrentUser: GetCurrentUserUseCase;
    listProjects: ListProjectsUseCase;
    getProjectById: GetProjectByIdUseCase;
    createProject: CreateProjectUseCase;
  };
}

declare global {
  var __openchatBackendContainer: ApplicationContainer | undefined;
}

export function getApplicationContainer(): ApplicationContainer {
  if (!globalThis.__openchatBackendContainer) {
    globalThis.__openchatBackendContainer = createApplicationContainer();
  }

  return globalThis.__openchatBackendContainer;
}

function createApplicationContainer(): ApplicationContainer {
  const config = loadBackendConfig();

  if (config.db.adapter !== "postgres") {
    throw new Error("Convex adapter wiring is not implemented yet");
  }

  const pool = getPostgresPool(config.db.databaseUrl as string);
  const repositories = createPostgresRepositories(pool);
  const unitOfWork = new PostgresUnitOfWork(pool);

  const jwtVerifier = new JwtMultiIssuerVerifier(config.auth.issuers, config.auth.clockSkewSeconds);
  const authContextProvider = new JitProvisioningAuthContextProvider(jwtVerifier, unitOfWork);
  const permissionChecker = new DbRolePermissionChecker();

  const useCases = {
    getCurrentUser: new GetCurrentUserUseCase(repositories.users),
    listProjects: new ListProjectsUseCase(repositories.projects),
    getProjectById: new GetProjectByIdUseCase(repositories.projects),
    createProject: new CreateProjectUseCase(unitOfWork),
  };

  return {
    config,
    authContextProvider,
    permissionChecker,
    repositories,
    unitOfWork,
    useCases,
  };
}
