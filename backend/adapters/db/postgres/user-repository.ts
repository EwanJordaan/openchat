import type { QueryResultRow } from "pg";

import type { User } from "@/backend/domain/user";
import type { CreateUserInput, UpdateUserProfileInput, UserRepository } from "@/backend/ports/repositories";

import { toIsoString } from "@/backend/adapters/db/postgres/mappers";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface UserRow extends QueryResultRow {
  id: string;
  email: string | null;
  name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_seen_at: Date | string;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: PgQueryable) {}

  async getById(userId: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `
      SELECT id, email, name, created_at, updated_at, last_seen_at
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserRow(result.rows[0]);
  }

  async getByExternalIdentity(issuer: string, subject: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `
      SELECT u.id, u.email, u.name, u.created_at, u.updated_at, u.last_seen_at
      FROM users u
      INNER JOIN external_identities ei ON ei.user_id = u.id
      WHERE ei.issuer = $1 AND ei.subject = $2
      `,
      [issuer, subject],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserRow(result.rows[0]);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const result = await this.db.query<UserRow>(
      `
      INSERT INTO users (id, email, name)
      VALUES ($1, $2, $3)
      RETURNING id, email, name, created_at, updated_at, last_seen_at
      `,
      [crypto.randomUUID(), input.email ?? null, input.name ?? null],
    );

    return this.mapUserRow(result.rows[0]);
  }

  async updateProfile(userId: string, input: UpdateUserProfileInput): Promise<User> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.email !== undefined) {
      values.push(input.email ?? null);
      fields.push(`email = $${values.length}`);
    }

    if (input.name !== undefined) {
      values.push(input.name ?? null);
      fields.push(`name = $${values.length}`);
    }

    if (fields.length === 0) {
      const existingUser = await this.getById(userId);
      if (!existingUser) {
        throw new Error(`Cannot update profile for unknown user: ${userId}`);
      }
      return existingUser;
    }

    values.push(userId);

    const result = await this.db.query<UserRow>(
      `
      UPDATE users
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, email, name, created_at, updated_at, last_seen_at
      `,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error(`Cannot update profile for unknown user: ${userId}`);
    }

    return this.mapUserRow(result.rows[0]);
  }

  async touchLastSeen(userId: string, lastSeenAtIso: string): Promise<void> {
    await this.db.query(
      `
      UPDATE users
      SET last_seen_at = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [userId, lastSeenAtIso],
    );
  }

  async linkExternalIdentity(userId: string, issuer: string, subject: string): Promise<void> {
    await this.db.query(
      `
      INSERT INTO external_identities (id, user_id, issuer, subject)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (issuer, subject) DO NOTHING
      `,
      [crypto.randomUUID(), userId, issuer, subject],
    );
  }

  private mapUserRow(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
      lastSeenAt: toIsoString(row.last_seen_at),
    };
  }
}
