import { Pool } from "pg";

export function getPostgresPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 20,
  });
}
