import type { QueryResultRow } from "pg";

import type { User } from "@/backend/domain/user";
import type {
  CreateUserInput,
  SetUserAvatarInput,
  UpsertExternalIdentityMetadataInput,
  UpdateUserProfileInput,
  UserAvatar,
  UserRepository,
} from "@/backend/ports/repositories";

import { toIsoString, toNullableIsoString } from "@/backend/adapters/db/postgres/mappers";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

interface UserRow extends QueryResultRow {
  id: string;
  email: string | null;
  name: string | null;
  avatar_mime_type: string | null;
  avatar_updated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_seen_at: Date | string;
}

interface UserAvatarRow extends QueryResultRow {
  avatar_mime_type: string | null;
  avatar_bytes: Buffer | Uint8Array | null;
  avatar_updated_at: Date | string | null;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: PgQueryable) {}

  async getById(userId: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `
      SELECT id, email, name, avatar_mime_type, avatar_updated_at, created_at, updated_at, last_seen_at
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

  async getAvatar(userId: string): Promise<UserAvatar | null> {
    const result = await this.db.query<UserAvatarRow>(
      `
      SELECT avatar_mime_type, avatar_bytes, avatar_updated_at
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row.avatar_mime_type || !row.avatar_bytes || !row.avatar_updated_at) {
      return null;
    }

    return {
      mimeType: row.avatar_mime_type,
      bytes: row.avatar_bytes instanceof Uint8Array ? row.avatar_bytes : Buffer.from(row.avatar_bytes),
      updatedAt: toIsoString(row.avatar_updated_at),
    };
  }

  async getByExternalIdentity(issuer: string, subject: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      `
      SELECT u.id, u.email, u.name, u.avatar_mime_type, u.avatar_updated_at, u.created_at, u.updated_at, u.last_seen_at
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
      RETURNING id, email, name, avatar_mime_type, avatar_updated_at, created_at, updated_at, last_seen_at
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
      RETURNING id, email, name, avatar_mime_type, avatar_updated_at, created_at, updated_at, last_seen_at
      `,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error(`Cannot update profile for unknown user: ${userId}`);
    }

    return this.mapUserRow(result.rows[0]);
  }

  async setAvatar(userId: string, input: SetUserAvatarInput): Promise<User> {
    const result = await this.db.query<UserRow>(
      `
      UPDATE users
      SET avatar_mime_type = $2,
          avatar_bytes = $3,
          avatar_updated_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, name, avatar_mime_type, avatar_updated_at, created_at, updated_at, last_seen_at
      `,
      [userId, input.mimeType, Buffer.from(input.bytes)],
    );

    if (result.rows.length === 0) {
      throw new Error(`Cannot set avatar for unknown user: ${userId}`);
    }

    return this.mapUserRow(result.rows[0]);
  }

  async clearAvatar(userId: string): Promise<User> {
    const result = await this.db.query<UserRow>(
      `
      UPDATE users
      SET avatar_mime_type = NULL,
          avatar_bytes = NULL,
          avatar_updated_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, name, avatar_mime_type, avatar_updated_at, created_at, updated_at, last_seen_at
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new Error(`Cannot clear avatar for unknown user: ${userId}`);
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

  async upsertExternalIdentityMetadata(
    userId: string,
    issuer: string,
    subject: string,
    input: UpsertExternalIdentityMetadataInput,
  ): Promise<void> {
    await this.db.query(
      `
      INSERT INTO external_identities (
        id,
        user_id,
        issuer,
        subject,
        provider_name,
        email,
        name,
        raw_claims_json,
        last_authenticated_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
      ON CONFLICT (issuer, subject)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        provider_name = EXCLUDED.provider_name,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        raw_claims_json = EXCLUDED.raw_claims_json,
        last_authenticated_at = EXCLUDED.last_authenticated_at,
        updated_at = NOW()
      `,
      [
        crypto.randomUUID(),
        userId,
        issuer,
        subject,
        input.providerName,
        input.email ?? null,
        input.name ?? null,
        JSON.stringify(input.rawClaims ?? {}),
        input.lastAuthenticatedAtIso,
      ],
    );
  }

  private mapUserRow(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarMimeType: row.avatar_mime_type,
      avatarUpdatedAt: toNullableIsoString(row.avatar_updated_at),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
      lastSeenAt: toIsoString(row.last_seen_at),
    };
  }
}
