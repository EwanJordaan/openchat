import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";

const TABLES = [
  "audit_logs",
  "usage_counters",
  "user_settings",
  "messages",
  "temporary_chats",
  "files",
  "chats",
  "sessions",
  "auth_accounts",
  "auth_sessions",
  "auth_verifications",
  "user_roles",
  "users",
  "role_limits",
  "models",
  "provider_credentials",
  "app_settings",
] as const;

export async function resetDatabase() {
  const { query } = getDb();
  for (const table of TABLES) {
    await query(sql.raw(`delete from ${table}`)).catch(() => undefined);
  }
}
