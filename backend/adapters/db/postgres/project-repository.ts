import type { QueryResultRow } from "pg";

import type { Project } from "@/backend/domain/project";
import type { CreateProjectInput, ProjectRepository } from "@/backend/ports/repositories";

import { toIsoString } from "@/backend/adapters/db/postgres/mappers";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface ProjectRow extends QueryResultRow {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: Date | string;
}

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly db: PgQueryable) {}

  async listForUser(userId: string): Promise<Project[]> {
    const result = await this.db.query<ProjectRow>(
      `
      SELECT id, owner_user_id, name, created_at
      FROM projects
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => this.mapProject(row));
  }

  async getByIdForUser(projectId: string, userId: string): Promise<Project | null> {
    const result = await this.db.query<ProjectRow>(
      `
      SELECT id, owner_user_id, name, created_at
      FROM projects
      WHERE id = $1 AND owner_user_id = $2
      `,
      [projectId, userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapProject(result.rows[0]);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const result = await this.db.query<ProjectRow>(
      `
      INSERT INTO projects (id, owner_user_id, name)
      VALUES ($1, $2, $3)
      RETURNING id, owner_user_id, name, created_at
      `,
      [input.id, input.ownerUserId, input.name],
    );

    return this.mapProject(result.rows[0]);
  }

  private mapProject(row: ProjectRow): Project {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      createdAt: toIsoString(row.created_at),
    };
  }
}
