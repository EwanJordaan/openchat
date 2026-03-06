import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import mysql from "mysql2/promise";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { mysqlAuthSchema, pgAuthSchema } from "@/lib/db/schema";

type Provider = "postgres" | "supabase" | "neon" | "mysql";

type ExecutableDb = {
  execute: (statement: never) => Promise<unknown>;
};

interface DbContext {
  provider: Provider;
  db: ExecutableDb;
  query: <T>(statement: SQL) => Promise<T[]>;
}

declare global {
  var __openchatDbContext: DbContext | undefined;
}

function extractRows<T>(result: unknown) {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  if (result && typeof result === "object" && "0" in result) {
    return (result as { 0: T[] })[0];
  }
  return [] as T[];
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

  return error;
}

function createContext(): DbContext {
  const provider = env.DATABASE_PROVIDER as Provider;

  if (provider === "mysql") {
    const pool = mysql.createPool(env.DATABASE_URL);
    const db = drizzleMysql(pool, { schema: mysqlAuthSchema, mode: "default" }) as ExecutableDb;

    return {
      provider,
      db,
      query: async <T>(statement: SQL) => {
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

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
  });
  const db = drizzlePg(pool, { schema: pgAuthSchema }) as unknown as ExecutableDb;

  return {
    provider,
    db,
    query: async <T>(statement: SQL) => {
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
