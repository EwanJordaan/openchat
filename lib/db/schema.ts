import { int as mysqlInt, mysqlTable, text as mysqlText, varchar as mysqlVarchar } from "drizzle-orm/mysql-core";
import { integer as pgInteger, pgTable, text as pgText } from "drizzle-orm/pg-core";

export const pgUsers = pgTable("users", {
  id: pgText("id").primaryKey(),
  email: pgText("email").notNull(),
  password_hash: pgText("password_hash").notNull(),
  name: pgText("name").notNull(),
  image_url: pgText("image_url"),
  is_active: pgInteger("is_active").notNull(),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgAuthSessions = pgTable("auth_sessions", {
  id: pgText("id").primaryKey(),
  expires_at: pgText("expires_at").notNull(),
  token: pgText("token").notNull(),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
  ip_address: pgText("ip_address"),
  user_agent: pgText("user_agent"),
  user_id: pgText("user_id").notNull(),
});

export const pgAuthAccounts = pgTable("auth_accounts", {
  id: pgText("id").primaryKey(),
  account_id: pgText("account_id").notNull(),
  provider_id: pgText("provider_id").notNull(),
  user_id: pgText("user_id").notNull(),
  access_token: pgText("access_token"),
  refresh_token: pgText("refresh_token"),
  id_token: pgText("id_token"),
  access_token_expires_at: pgText("access_token_expires_at"),
  refresh_token_expires_at: pgText("refresh_token_expires_at"),
  scope: pgText("scope"),
  password: pgText("password"),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgAuthVerifications = pgTable("auth_verifications", {
  id: pgText("id").primaryKey(),
  identifier: pgText("identifier").notNull(),
  value: pgText("value").notNull(),
  expires_at: pgText("expires_at").notNull(),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const mysqlUsers = mysqlTable("users", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  email: mysqlVarchar("email", { length: 255 }).notNull(),
  password_hash: mysqlText("password_hash").notNull(),
  name: mysqlVarchar("name", { length: 255 }).notNull(),
  image_url: mysqlText("image_url"),
  is_active: mysqlInt("is_active").notNull(),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlAuthSessions = mysqlTable("auth_sessions", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  expires_at: mysqlVarchar("expires_at", { length: 40 }).notNull(),
  token: mysqlVarchar("token", { length: 255 }).notNull(),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
  ip_address: mysqlVarchar("ip_address", { length: 191 }),
  user_agent: mysqlText("user_agent"),
  user_id: mysqlVarchar("user_id", { length: 191 }).notNull(),
});

export const mysqlAuthAccounts = mysqlTable("auth_accounts", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  account_id: mysqlVarchar("account_id", { length: 191 }).notNull(),
  provider_id: mysqlVarchar("provider_id", { length: 191 }).notNull(),
  user_id: mysqlVarchar("user_id", { length: 191 }).notNull(),
  access_token: mysqlText("access_token"),
  refresh_token: mysqlText("refresh_token"),
  id_token: mysqlText("id_token"),
  access_token_expires_at: mysqlVarchar("access_token_expires_at", { length: 40 }),
  refresh_token_expires_at: mysqlVarchar("refresh_token_expires_at", { length: 40 }),
  scope: mysqlText("scope"),
  password: mysqlText("password"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlAuthVerifications = mysqlTable("auth_verifications", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  identifier: mysqlVarchar("identifier", { length: 255 }).notNull(),
  value: mysqlText("value").notNull(),
  expires_at: mysqlVarchar("expires_at", { length: 40 }).notNull(),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const pgAuthSchema = {
  users: pgUsers,
  auth_sessions: pgAuthSessions,
  auth_accounts: pgAuthAccounts,
  auth_verifications: pgAuthVerifications,
};

export const mysqlAuthSchema = {
  users: mysqlUsers,
  auth_sessions: mysqlAuthSessions,
  auth_accounts: mysqlAuthAccounts,
  auth_verifications: mysqlAuthVerifications,
};
