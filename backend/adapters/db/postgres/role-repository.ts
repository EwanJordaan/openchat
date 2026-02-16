import type { QueryResultRow } from "pg";

import type { RoleRepository } from "@/backend/ports/repositories";

import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface RoleIdRow extends QueryResultRow {
  id: string;
}

interface RoleNameRow extends QueryResultRow {
  name: string;
}

export class PostgresRoleRepository implements RoleRepository {
  constructor(private readonly db: PgQueryable) {}

  async assignRoleToUser(userId: string, roleName: string): Promise<void> {
    const roleResult = await this.db.query<RoleIdRow>(
      `
      SELECT id
      FROM roles
      WHERE name = $1
      `,
      [roleName],
    );

    if (roleResult.rows.length === 0) {
      throw new Error(`Role does not exist: ${roleName}`);
    }

    await this.db.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING
      `,
      [userId, roleResult.rows[0].id],
    );
  }

  async listRoleNamesForUser(userId: string): Promise<string[]> {
    const result = await this.db.query<RoleNameRow>(
      `
      SELECT r.name
      FROM roles r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ORDER BY r.name ASC
      `,
      [userId],
    );

    return result.rows.map((row) => row.name);
  }
}
