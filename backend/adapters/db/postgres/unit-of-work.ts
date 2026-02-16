import type { Pool } from "pg";

import type { RepositoryBundle } from "@/backend/ports/repositories";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

import { createPostgresRepositories } from "@/backend/adapters/db/postgres/repository-factory";

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (repositories: RepositoryBundle) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const repositories = createPostgresRepositories(client);
      const result = await work(repositories);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
