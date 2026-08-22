import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

const TABLES = [
  "audit_logs",
  "usage_counters",
  "user_settings",
  "tool_events",
  "messages",
  "chats",
  "document_chunks",
  "documents",
  "project_members",
  "projects",
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
  for (const t of TABLES) await query(sql.raw(`delete from ${t}`)).catch(() => undefined);
}

export async function seedMinimal() {
  const { ensureDatabase } = await import("@/lib/db/bootstrap");
  await ensureDatabase();
}
