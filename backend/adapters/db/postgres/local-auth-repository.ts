import type { Pool, PoolClient } from "pg";

import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import type {
  CreateLocalAuthCredentialInput,
  CreateLocalAuthSessionInput,
  LocalAuthCredential,
  LocalAuthRepository,
  LocalAuthSession,
} from "@/backend/ports/repositories";

import { toIsoString } from "@/backend/adapters/db/postgres/mappers";
import {
  localAuthCredentialsTable,
  localAuthSessionsTable,
} from "@/backend/adapters/db/postgres/drizzle/local-auth-schema";
import type { PgQueryable } from "@/backend/adapters/db/postgres/types";

export class PostgresLocalAuthRepository implements LocalAuthRepository {
  constructor(private readonly db: PgQueryable) {}

  async getCredentialByEmail(email: string): Promise<LocalAuthCredential | null> {
    const normalizedEmail = normalizeEmail(email);
    const drizzleDb = this.getDrizzleDb();

    const rows = await drizzleDb
      .select()
      .from(localAuthCredentialsTable)
      .where(eq(localAuthCredentialsTable.email, normalizedEmail))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.userId,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  async createCredential(input: CreateLocalAuthCredentialInput): Promise<LocalAuthCredential> {
    const normalizedEmail = normalizeEmail(input.email);
    const drizzleDb = this.getDrizzleDb();

    const rows = await drizzleDb
      .insert(localAuthCredentialsTable)
      .values({
        userId: input.userId,
        email: normalizedEmail,
        passwordHash: input.passwordHash,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to create local auth credential");
    }

    return {
      userId: row.userId,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  async createSession(input: CreateLocalAuthSessionInput): Promise<LocalAuthSession> {
    const drizzleDb = this.getDrizzleDb();

    const rows = await drizzleDb
      .insert(localAuthSessionsTable)
      .values({
        id: input.id,
        userId: input.userId,
        expiresAt: new Date(input.expiresAt),
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to create local auth session");
    }

    return {
      id: row.id,
      userId: row.userId,
      expiresAt: toIsoString(row.expiresAt),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  async getSessionById(sessionId: string): Promise<LocalAuthSession | null> {
    const drizzleDb = this.getDrizzleDb();

    const rows = await drizzleDb
      .select()
      .from(localAuthSessionsTable)
      .where(
        and(
          eq(localAuthSessionsTable.id, sessionId),
          gt(localAuthSessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      expiresAt: toIsoString(row.expiresAt),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const drizzleDb = this.getDrizzleDb();

    await drizzleDb.delete(localAuthSessionsTable).where(eq(localAuthSessionsTable.id, sessionId));
  }

  private getDrizzleDb() {
    return drizzle(this.db as unknown as Pool | PoolClient);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
