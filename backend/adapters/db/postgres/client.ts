import { Pool } from "pg";

let poolSingleton: Pool | null = null;

export function getPostgresPool(databaseUrl: string): Pool {
  if (!poolSingleton) {
    poolSingleton = new Pool({
      connectionString: databaseUrl,
      max: 20,
    });
  }

  return poolSingleton;
}
