import { int as mysqlInt, mysqlTable, text as mysqlText, varchar as mysqlVarchar } from "drizzle-orm/mysql-core";
import { integer as pgInteger, pgTable, text as pgText } from "drizzle-orm/pg-core";

export const pgAppSettings = pgTable("app_settings", {
  setting_key: pgText("setting_key").primaryKey(),
  value_json: pgText("value_json").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgProviderCredentials = pgTable("provider_credentials", {
  id: pgText("id").primaryKey(),
  provider: pgText("provider").notNull(),
  base_url: pgText("base_url").notNull(),
  encrypted_api_key: pgText("encrypted_api_key"),
  is_enabled: pgInteger("is_enabled").notNull().default(1),
  updated_at: pgText("updated_at").notNull(),
});

export const pgModels = pgTable("models", {
  id: pgText("id").primaryKey(),
  provider: pgText("provider").notNull(),
  display_name: pgText("display_name").notNull(),
  description: pgText("description").notNull(),
  is_enabled: pgInteger("is_enabled").notNull().default(1),
  is_default: pgInteger("is_default").notNull().default(0),
  is_guest_allowed: pgInteger("is_guest_allowed").notNull().default(0),
  max_output_tokens: pgInteger("max_output_tokens").notNull().default(2048),
  supports_tools: pgInteger("supports_tools").notNull().default(0),
  context_window: pgInteger("context_window"),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgEmbedModels = pgTable("embed_models", {
  id: pgText("id").primaryKey(),
  provider: pgText("provider").notNull(),
  model_id: pgText("model_id").notNull(),
  dims: pgInteger("dims").notNull(),
  is_default: pgInteger("is_default").notNull().default(0),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgRoleLimits = pgTable("role_limits", {
  id: pgText("id").primaryKey(),
  role: pgText("role").notNull(),
  daily_message_limit: pgInteger("daily_message_limit").notNull(),
  max_attachment_count: pgInteger("max_attachment_count").notNull(),
  max_attachment_mb: pgInteger("max_attachment_mb").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgUserSettings = pgTable("user_settings", {
  user_id: pgText("user_id").primaryKey(),
  theme: pgText("theme").notNull(),
  compact_mode: pgInteger("compact_mode").notNull(),
  enter_to_send: pgInteger("enter_to_send").notNull(),
  show_tokens: pgInteger("show_tokens").notNull(),
  timezone: pgText("timezone").notNull(),
  language: pgText("language").notNull(),
  auto_title_chats: pgInteger("auto_title_chats").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgUsageCounters = pgTable("usage_counters", {
  id: pgText("id").primaryKey(),
  user_id: pgText("user_id").notNull(),
  date_key: pgText("date_key").notNull(),
  message_count: pgInteger("message_count").notNull(),
  token_count: pgInteger("token_count").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgAuditLogs = pgTable("audit_logs", {
  id: pgText("id").primaryKey(),
  actor_user_id: pgText("actor_user_id"),
  action: pgText("action").notNull(),
  target_type: pgText("target_type").notNull(),
  target_id: pgText("target_id"),
  payload_json: pgText("payload_json").notNull(),
  created_at: pgText("created_at").notNull(),
});

// --- mysql variants ---

export const mysqlAppSettings = mysqlTable("app_settings", {
  setting_key: mysqlVarchar("setting_key", { length: 191 }).primaryKey(),
  value_json: mysqlText("value_json").notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlProviderCredentials = mysqlTable("provider_credentials", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  provider: mysqlVarchar("provider", { length: 191 }).notNull(),
  base_url: mysqlText("base_url").notNull(),
  encrypted_api_key: mysqlText("encrypted_api_key"),
  is_enabled: mysqlInt("is_enabled").notNull().default(1),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlModels = mysqlTable("models", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  provider: mysqlVarchar("provider", { length: 191 }).notNull(),
  display_name: mysqlVarchar("display_name", { length: 255 }).notNull(),
  description: mysqlText("description").notNull(),
  is_enabled: mysqlInt("is_enabled").notNull().default(1),
  is_default: mysqlInt("is_default").notNull().default(0),
  is_guest_allowed: mysqlInt("is_guest_allowed").notNull().default(0),
  max_output_tokens: mysqlInt("max_output_tokens").notNull().default(2048),
  supports_tools: mysqlInt("supports_tools").notNull().default(0),
  context_window: mysqlInt("context_window"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlEmbedModels = mysqlTable("embed_models", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  provider: mysqlVarchar("provider", { length: 191 }).notNull(),
  model_id: mysqlVarchar("model_id", { length: 191 }).notNull(),
  dims: mysqlInt("dims").notNull(),
  is_default: mysqlInt("is_default").notNull().default(0),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlRoleLimits = mysqlTable("role_limits", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  role: mysqlVarchar("role", { length: 50 }).notNull(),
  daily_message_limit: mysqlInt("daily_message_limit").notNull(),
  max_attachment_count: mysqlInt("max_attachment_count").notNull(),
  max_attachment_mb: mysqlInt("max_attachment_mb").notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlUserSettings = mysqlTable("user_settings", {
  user_id: mysqlVarchar("user_id", { length: 191 }).primaryKey(),
  theme: mysqlVarchar("theme", { length: 20 }).notNull(),
  compact_mode: mysqlInt("compact_mode").notNull(),
  enter_to_send: mysqlInt("enter_to_send").notNull(),
  show_tokens: mysqlInt("show_tokens").notNull(),
  timezone: mysqlVarchar("timezone", { length: 120 }).notNull(),
  language: mysqlVarchar("language", { length: 20 }).notNull(),
  auto_title_chats: mysqlInt("auto_title_chats").notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlUsageCounters = mysqlTable("usage_counters", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  user_id: mysqlVarchar("user_id", { length: 191 }).notNull(),
  date_key: mysqlVarchar("date_key", { length: 20 }).notNull(),
  message_count: mysqlInt("message_count").notNull(),
  token_count: mysqlInt("token_count").notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlAuditLogs = mysqlTable("audit_logs", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  actor_user_id: mysqlVarchar("actor_user_id", { length: 191 }),
  action: mysqlVarchar("action", { length: 191 }).notNull(),
  target_type: mysqlVarchar("target_type", { length: 191 }).notNull(),
  target_id: mysqlVarchar("target_id", { length: 191 }),
  payload_json: mysqlText("payload_json").notNull(),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
});
