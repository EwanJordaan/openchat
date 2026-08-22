import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import mysql from "mysql2/promise";
import { Pool } from "pg";

import { env, resolveDatabaseUrl } from "@/lib/env";
import { mysqlAuthSchema, pgAuthSchema } from "@/lib/db/schema";

type Provider = "postgres" | "supabase" | "neon" | "mysql" | "railway";

type ExecutableDb = {
  execute: (statement: unknown) => Promise<unknown>;
};

export interface DbRunner {
  query: <T>(statement: SQL) => Promise<T[]>;
  execute: <T>(statement: SQL) => Promise<T[]>;
}

interface DbContext {
  provider: Provider;
  db: ExecutableDb;
  query: <T>(statement: SQL) => Promise<T[]>;
  execute: <T>(statement: SQL) => Promise<T[]>;
  withTransaction: <T>(callback: (tx: DbRunner) => Promise<T>) => Promise<T>;
}

declare global {
  var __openchatDbContext: DbContext | undefined;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  if (result && typeof result === "object" && "0" in result) {
    return (result as { 0: T[] })[0];
  }
  return [] as T[];
}

function resolveConnectionString(): string {
  return resolveDatabaseUrl();
}

function getPoolSslConfig(connectionString: string): false | { rejectUnauthorized: boolean } {
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    const search = url.search.toLowerCase();

    // Explicit sslmode in query string takes precedence
    if (search.includes("sslmode=disable") || search.includes("sslmode=allow")) return false;
    if (search.includes("sslmode=require") || search.includes("sslmode=verify")) return { rejectUnauthorized: false };

    // Local / private networking — no SSL needed
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "postgres" ||
      host.endsWith(".railway.internal") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    // Hosted providers (Railway public proxy, Supabase, Neon, etc.) need SSL but with self-signed handling
    if (
      host.includes("proxy.rlwy.net") ||
      host.includes("railway.app") ||
      host.includes(".supabase.co") ||
      host.includes("pooler.supabase.com") ||
      host.includes(".neon.tech") ||
      host.includes(".railway.internal") === false && host.includes("railway")
    ) {
      return { rejectUnauthorized: false };
    }

    // In production, default to SSL with lenient cert (common for managed Postgres)
    if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
      return { rejectUnauthorized: false };
    }

    return false;
  } catch {
    return false;
  }
}

function normalizeError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error("Unknown database error");
  }

  const anyError = error as Error & {
    code?: string;
    hostname?: string;
    cause?: { code?: string; hostname?: string };
  };
  const code = anyError.code || anyError.cause?.code;
  const hostname = anyError.hostname || anyError.cause?.hostname;

  if (code === "ENOTFOUND" && hostname?.includes(".supabase.co")) {
    return new Error(
      [
        `Supabase host '${hostname}' could not be resolved from this machine.`,
        "This usually happens when using the direct DB host (IPv6-only) on an IPv4-only network.",
        "Use Supabase's Session/Transaction pooler connection string (port 6543) from Project Settings -> Database.",
      ].join(" "),
    );
  }

  if (code === "ENOTFOUND" && hostname?.includes("railway.internal")) {
    return new Error(
      [
        `Railway internal host '${hostname}' could not be resolved.`,
        "This happens when running locally with DATABASE_URL pointing at the private network.",
        "Use the public DATABASE_PUBLIC_URL (proxy.rlwy.net) for local dev, or run inside Railway.",
      ].join(" "),
    );
  }

  if (code === "ENOTFOUND" && hostname?.includes("proxy.rlwy.net")) {
    return new Error(
      [`Railway host '${hostname}' could not be resolved: ${anyError.message ?? code}.`, "Check DATABASE_URL is the public URL from Railway → Postgres → Connect → Public Network."].join(" "),
    );
  }

  return error;
}

function createRunner(db: ExecutableDb): DbRunner {
  return {
    query: async <T>(statement: SQL) => {
      let result: unknown;
      try {
        result = await db.execute(statement as never);
      } catch (error) {
        throw normalizeError(error);
      }
      return extractRows<T>(result);
    },
    execute: async <T>(statement: SQL) => {
      let result: unknown;
      try {
        result = await db.execute(statement as never);
      } catch (error) {
        throw normalizeError(error);
      }
      return extractRows<T>(result);
    },
  };
}

function createContext(): DbContext {
  const provider = env.DATABASE_PROVIDER as Provider;

  if (provider === "mysql") {
    const connectionString = resolveConnectionString();
    const pool = mysql.createPool(connectionString);
    const db = drizzleMysql(pool, { schema: mysqlAuthSchema, mode: "default" }) as unknown as ExecutableDb;
    const runner = createRunner(db);

    return {
      provider,
      db,
      query: runner.query,
      execute: runner.execute,
      withTransaction: async <T>(callback: (tx: DbRunner) => Promise<T>) => {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const txDb = drizzleMysql(connection, {
            schema: mysqlAuthSchema,
            mode: "default",
          }) as unknown as ExecutableDb;
          const result = await callback(createRunner(txDb));
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback().catch(() => undefined);
          throw normalizeError(error);
        } finally {
          connection.release();
        }
      },
    };
  }

  const connectionString = resolveConnectionString();
  const ssl = getPoolSslConfig(connectionString);
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(ssl ? { ssl } : {}),
  });
  const db = drizzlePg(pool, { schema: pgAuthSchema }) as unknown as ExecutableDb;
  const runner = createRunner(db);

  return {
    provider,
    db,
    query: runner.query,
    execute: runner.execute,
    withTransaction: async <T>(callback: (tx: DbRunner) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txDb = drizzlePg(client, { schema: pgAuthSchema }) as unknown as ExecutableDb;
        const result = await callback(createRunner(txDb));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw normalizeError(error);
      } finally {
        client.release();
      }
    },
  };
}

export function getDb() {
  if (!globalThis.__openchatDbContext) {
    globalThis.__openchatDbContext = createContext();
  }
  return globalThis.__openchatDbContext;
}

export async function pingDatabase() {
  const { query } = getDb();
  await query(sql`select 1 as ok`);
}
