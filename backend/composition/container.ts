import { AppendChatMessageUseCase } from "@/backend/application/use-cases/append-chat-message";
import { CreateChatFromFirstMessageUseCase } from "@/backend/application/use-cases/create-chat-from-first-message";
import { CreateProjectUseCase } from "@/backend/application/use-cases/create-project";
import { GetChatByIdUseCase } from "@/backend/application/use-cases/get-chat-by-id";
import { GetCurrentUserUseCase } from "@/backend/application/use-cases/get-current-user";
import { GetCurrentUserAvatarUseCase } from "@/backend/application/use-cases/get-current-user-avatar";
import { GetProjectByIdUseCase } from "@/backend/application/use-cases/get-project-by-id";
import { ListChatsUseCase } from "@/backend/application/use-cases/list-chats";
import { ListProjectsUseCase } from "@/backend/application/use-cases/list-projects";
import { RemoveCurrentUserAvatarUseCase } from "@/backend/application/use-cases/remove-current-user-avatar";
import { UpdateCurrentUserProfileUseCase } from "@/backend/application/use-cases/update-current-user-profile";
import { UploadCurrentUserAvatarUseCase } from "@/backend/application/use-cases/upload-current-user-avatar";
import { JitProvisioningAuthContextProvider } from "@/backend/adapters/auth/jit-provisioning-auth-context-provider";
import { JwtMultiIssuerVerifier } from "@/backend/adapters/auth/jwt-multi-issuer-verifier";
import { LiveModelProviderClient } from "@/backend/adapters/ai/live-model-provider-client";
import { DbRolePermissionChecker } from "@/backend/adapters/authorization/db-role-permission-checker";
import { ConvexUnitOfWork, createConvexRepositories } from "@/backend/adapters/db/convex";
import { createPostgresRepositories } from "@/backend/adapters/db/postgres/repository-factory";
import { getPostgresPool } from "@/backend/adapters/db/postgres/client";
import { PostgresUnitOfWork } from "@/backend/adapters/db/postgres/unit-of-work";
import type { AuthContextProvider } from "@/backend/ports/auth-context-provider";
import type { ModelProviderClient } from "@/backend/ports/model-provider-client";
import type { PermissionChecker } from "@/backend/ports/permission-checker";
import type { RepositoryBundle } from "@/backend/ports/repositories";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

import { loadBackendConfig, type BackendConfig } from "@/backend/composition/config";

const CONTAINER_SHAPE_VERSION = 5;

interface ContainerState {
  fingerprint: string;
  container: ApplicationContainer;
  dispose?: () => Promise<void>;
}

let devContainerState: ContainerState | undefined;

export interface ApplicationContainer {
  config: BackendConfig;
  authContextProvider: AuthContextProvider;
  permissionChecker: PermissionChecker;
  modelProviderClient: ModelProviderClient;
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
    listChats: ListChatsUseCase;
    getChatById: GetChatByIdUseCase;
    createChatFromFirstMessage: CreateChatFromFirstMessageUseCase;
    appendChatMessage: AppendChatMessageUseCase;
  };
}

declare global {
  var __openchatBackendContainerState: ContainerState | undefined;
}

export function getApplicationContainer(): ApplicationContainer {
  const config = loadBackendConfig();
  const fingerprint = createConfigFingerprint(config);

  const currentState = getCurrentContainerState();
  if (currentState && currentState.fingerprint === fingerprint && isContainerCompatible(currentState.container)) {
    return currentState.container;
  }

  const nextState = createApplicationContainerState(config, fingerprint);
  setCurrentContainerState(nextState);

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
  const modelProviderClient = new LiveModelProviderClient();

  const useCases = {
    getCurrentUser: new GetCurrentUserUseCase(adapter.repositories.users),
    getCurrentUserAvatar: new GetCurrentUserAvatarUseCase(adapter.repositories.users),
    updateCurrentUserProfile: new UpdateCurrentUserProfileUseCase(adapter.repositories.users),
    uploadCurrentUserAvatar: new UploadCurrentUserAvatarUseCase(adapter.repositories.users),
    removeCurrentUserAvatar: new RemoveCurrentUserAvatarUseCase(adapter.repositories.users),
    listProjects: new ListProjectsUseCase(adapter.repositories.projects),
    getProjectById: new GetProjectByIdUseCase(adapter.repositories.projects),
    createProject: new CreateProjectUseCase(adapter.unitOfWork),
    listChats: new ListChatsUseCase(adapter.repositories.chats),
    getChatById: new GetChatByIdUseCase(adapter.repositories.chats),
    createChatFromFirstMessage: new CreateChatFromFirstMessageUseCase(adapter.unitOfWork, modelProviderClient),
    appendChatMessage: new AppendChatMessageUseCase(adapter.unitOfWork, modelProviderClient),
  };

  return {
    fingerprint,
    container: {
      config,
      authContextProvider,
      permissionChecker,
      modelProviderClient,
      repositories: adapter.repositories,
      unitOfWork: adapter.unitOfWork,
      useCases,
    },
    dispose: adapter.dispose,
  };
}

function getCurrentContainerState(): ContainerState | undefined {
  if (process.env.NODE_ENV === "production") {
    return globalThis.__openchatBackendContainerState;
  }

  return devContainerState;
}

function setCurrentContainerState(nextState: ContainerState): void {
  if (process.env.NODE_ENV === "production") {
    globalThis.__openchatBackendContainerState = nextState;
    return;
  }

  devContainerState = nextState;
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
    containerShapeVersion: CONTAINER_SHAPE_VERSION,
    db: config.db,
    auth: {
      clockSkewSeconds: config.auth.clockSkewSeconds,
      issuers: config.auth.issuers,
      defaultProviderName: config.auth.defaultProviderName,
      local: config.auth.local,
    },
    session: config.session,
    ai: config.ai,
    adminSetup: config.adminSetup,
    adminAuth: config.adminAuth,
  });
}

function isContainerCompatible(container: ApplicationContainer): boolean {
  const candidate = container as unknown as {
    modelProviderClient?: unknown;
    repositories?: { chats?: unknown; aiUsage?: unknown; localAuth?: unknown };
    useCases?: {
      listChats?: unknown;
      getChatById?: unknown;
      createChatFromFirstMessage?: unknown;
      appendChatMessage?: unknown;
    };
  };

  return Boolean(
    candidate.modelProviderClient &&
    candidate.repositories?.chats &&
      candidate.repositories?.aiUsage &&
      candidate.repositories?.localAuth &&
      candidate.useCases?.listChats &&
      candidate.useCases?.getChatById &&
      candidate.useCases?.createChatFromFirstMessage &&
      candidate.useCases?.appendChatMessage,
  );
}
