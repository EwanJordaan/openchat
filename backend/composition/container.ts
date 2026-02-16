import { CreateProjectUseCase } from "@/backend/application/use-cases/create-project";
import { GetCurrentUserUseCase } from "@/backend/application/use-cases/get-current-user";
import { GetCurrentUserAvatarUseCase } from "@/backend/application/use-cases/get-current-user-avatar";
import { GetProjectByIdUseCase } from "@/backend/application/use-cases/get-project-by-id";
import { ListProjectsUseCase } from "@/backend/application/use-cases/list-projects";
import { RemoveCurrentUserAvatarUseCase } from "@/backend/application/use-cases/remove-current-user-avatar";
import { UpdateCurrentUserProfileUseCase } from "@/backend/application/use-cases/update-current-user-profile";
import { UploadCurrentUserAvatarUseCase } from "@/backend/application/use-cases/upload-current-user-avatar";
import { JitProvisioningAuthContextProvider } from "@/backend/adapters/auth/jit-provisioning-auth-context-provider";
import { JwtMultiIssuerVerifier } from "@/backend/adapters/auth/jwt-multi-issuer-verifier";
import { DbRolePermissionChecker } from "@/backend/adapters/authorization/db-role-permission-checker";
import { ConvexUnitOfWork, createConvexRepositories } from "@/backend/adapters/db/convex";
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
    getCurrentUserAvatar: GetCurrentUserAvatarUseCase;
    updateCurrentUserProfile: UpdateCurrentUserProfileUseCase;
    uploadCurrentUserAvatar: UploadCurrentUserAvatarUseCase;
    removeCurrentUserAvatar: RemoveCurrentUserAvatarUseCase;
    listProjects: ListProjectsUseCase;
    getProjectById: GetProjectByIdUseCase;
    createProject: CreateProjectUseCase;
  };
}

declare global {
  var __openchatBackendContainerState:
    | {
        fingerprint: string;
        container: ApplicationContainer;
        dispose?: () => Promise<void>;
      }
    | undefined;
}

export function getApplicationContainer(): ApplicationContainer {
  const config = loadBackendConfig();
  const fingerprint = createConfigFingerprint(config);

  const currentState = globalThis.__openchatBackendContainerState;
  if (currentState && currentState.fingerprint === fingerprint) {
    return currentState.container;
  }

  const nextState = createApplicationContainerState(config, fingerprint);
  globalThis.__openchatBackendContainerState = nextState;

  if (currentState?.dispose) {
    void currentState.dispose().catch(() => {
      // Ignore cleanup errors while hot-switching adapters.
    });
  }

  return nextState.container;
}

function createApplicationContainerState(config: BackendConfig, fingerprint: string): {
  fingerprint: string;
  container: ApplicationContainer;
  dispose?: () => Promise<void>;
} {
  const adapter = createDataAdapter(config);

  const jwtVerifier = new JwtMultiIssuerVerifier(config.auth.issuers, config.auth.clockSkewSeconds);
  const authContextProvider = new JitProvisioningAuthContextProvider(jwtVerifier, adapter.unitOfWork);
  const permissionChecker = new DbRolePermissionChecker();

  const useCases = {
    getCurrentUser: new GetCurrentUserUseCase(adapter.repositories.users),
    getCurrentUserAvatar: new GetCurrentUserAvatarUseCase(adapter.repositories.users),
    updateCurrentUserProfile: new UpdateCurrentUserProfileUseCase(adapter.repositories.users),
    uploadCurrentUserAvatar: new UploadCurrentUserAvatarUseCase(adapter.repositories.users),
    removeCurrentUserAvatar: new RemoveCurrentUserAvatarUseCase(adapter.repositories.users),
    listProjects: new ListProjectsUseCase(adapter.repositories.projects),
    getProjectById: new GetProjectByIdUseCase(adapter.repositories.projects),
    createProject: new CreateProjectUseCase(adapter.unitOfWork),
  };

  return {
    fingerprint,
    container: {
      config,
      authContextProvider,
      permissionChecker,
      repositories: adapter.repositories,
      unitOfWork: adapter.unitOfWork,
      useCases,
    },
    dispose: adapter.dispose,
  };
}

interface DataAdapterRuntime {
  repositories: RepositoryBundle;
  unitOfWork: UnitOfWork;
  dispose?: () => Promise<void>;
}

function createDataAdapter(config: BackendConfig): DataAdapterRuntime {
  if (config.db.adapter === "postgres") {
    const pool = getPostgresPool(config.db.databaseUrl as string);
    const repositories = createPostgresRepositories(pool);
    const unitOfWork = new PostgresUnitOfWork(pool);

    return {
      repositories,
      unitOfWork,
      dispose: async () => {
        await pool.end();
      },
    };
  }

  const repositories = createConvexRepositories();
  const unitOfWork = new ConvexUnitOfWork(repositories);

  return {
    repositories,
    unitOfWork,
  };
}

function createConfigFingerprint(config: BackendConfig): string {
  return JSON.stringify({
    db: config.db,
    auth: {
      clockSkewSeconds: config.auth.clockSkewSeconds,
      issuers: config.auth.issuers,
    },
    session: config.session,
  });
}
