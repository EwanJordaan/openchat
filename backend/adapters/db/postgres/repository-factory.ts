import { PostgresChatRepository } from "@/backend/adapters/db/postgres/chat-repository";
import type { RepositoryBundle } from "@/backend/ports/repositories";

import { PostgresAiUsageRepository } from "@/backend/adapters/db/postgres/ai-usage-repository";
import { PostgresLocalAuthRepository } from "@/backend/adapters/db/postgres/local-auth-repository";
import { PostgresProjectRepository } from "@/backend/adapters/db/postgres/project-repository";
import { PostgresRoleRepository } from "@/backend/adapters/db/postgres/role-repository";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";
import { PostgresUserRepository } from "@/backend/adapters/db/postgres/user-repository";

export function createPostgresRepositories(db: PgQueryable): RepositoryBundle {
  return {
    users: new PostgresUserRepository(db),
    roles: new PostgresRoleRepository(db),
    projects: new PostgresProjectRepository(db),
    chats: new PostgresChatRepository(db),
    aiUsage: new PostgresAiUsageRepository(db),
    localAuth: new PostgresLocalAuthRepository(db),
  };
}
