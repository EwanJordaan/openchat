import { int as mysqlInt, mysqlTable, text as mysqlText, varchar as mysqlVarchar } from "drizzle-orm/mysql-core";
import { integer as pgInteger, pgTable, text as pgText } from "drizzle-orm/pg-core";

export const pgChats = pgTable("chats", {
  id: pgText("id").primaryKey(),
  project_id: pgText("project_id"),
  user_id: pgText("user_id"),
  guest_id: pgText("guest_id"),
  title: pgText("title").notNull(),
  model_id: pgText("model_id").notNull(),
  agent_preset: pgText("agent_preset"),
  archived: pgInteger("archived").notNull().default(0),
  is_pinned: pgInteger("is_pinned").notNull().default(0),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgMessages = pgTable("messages", {
  id: pgText("id").primaryKey(),
  chat_id: pgText("chat_id").notNull(),
  role: pgText("role").notNull(),
  content: pgText("content").notNull(),
  model_id: pgText("model_id").notNull(),
  attachments_json: pgText("attachments_json").notNull().default("[]"),
  tool_calls: pgText("tool_calls"),
  tool_call_id: pgText("tool_call_id"),
  citations: pgText("citations"),
  token_count: pgInteger("token_count"),
  created_at: pgText("created_at").notNull(),
});

export const pgToolEvents = pgTable("tool_events", {
  id: pgText("id").primaryKey(),
  chat_id: pgText("chat_id").notNull(),
  message_id: pgText("message_id"),
  tool_name: pgText("tool_name").notNull(),
  input: pgText("input").notNull(),
  output: pgText("output"),
  status: pgText("status").notNull(),
  latency_ms: pgInteger("latency_ms"),
  created_at: pgText("created_at").notNull(),
});

export const mysqlChats = mysqlTable("chats", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  project_id: mysqlVarchar("project_id", { length: 191 }),
  user_id: mysqlVarchar("user_id", { length: 191 }),
  guest_id: mysqlVarchar("guest_id", { length: 191 }),
  title: mysqlText("title").notNull(),
  model_id: mysqlVarchar("model_id", { length: 191 }).notNull(),
  agent_preset: mysqlVarchar("agent_preset", { length: 50 }),
  archived: mysqlInt("archived").notNull().default(0),
  is_pinned: mysqlInt("is_pinned").notNull().default(0),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlMessages = mysqlTable("messages", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  chat_id: mysqlVarchar("chat_id", { length: 191 }).notNull(),
  role: mysqlVarchar("role", { length: 40 }).notNull(),
  content: mysqlText("content").notNull(),
  model_id: mysqlVarchar("model_id", { length: 191 }).notNull(),
  attachments_json: mysqlText("attachments_json").notNull(),
  tool_calls: mysqlText("tool_calls"),
  tool_call_id: mysqlVarchar("tool_call_id", { length: 191 }),
  citations: mysqlText("citations"),
  token_count: mysqlInt("token_count"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
});

export const mysqlToolEvents = mysqlTable("tool_events", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  chat_id: mysqlVarchar("chat_id", { length: 191 }).notNull(),
  message_id: mysqlVarchar("message_id", { length: 191 }),
  tool_name: mysqlVarchar("tool_name", { length: 191 }).notNull(),
  input: mysqlText("input").notNull(),
  output: mysqlText("output"),
  status: mysqlVarchar("status", { length: 20 }).notNull(),
  latency_ms: mysqlInt("latency_ms"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
});
