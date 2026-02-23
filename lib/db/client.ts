import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import mysql from "mysql2/promise";
import { Pool } from "pg";

import { env } from "@/lib/env";

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

function createContext(): DbContext {
  const provider = env.DATABASE_PROVIDER as Provider;

  if (provider === "mysql") {
    const pool = mysql.createPool(env.DATABASE_URL);
    const db = drizzleMysql(pool) as ExecutableDb;

    return {
      provider,
      db,
      query: async <T>(statement: SQL) => {
        const result = await db.execute(statement as never);
        return extractRows<T>(result);
      },
    };
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
  });
  const db = drizzlePg(pool) as unknown as ExecutableDb;

  return {
    provider,
    db,
    query: async <T>(statement: SQL) => {
      const result = await db.execute(statement as never);
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
