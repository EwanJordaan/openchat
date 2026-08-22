import { mysqlTable, text as mysqlText, varchar as mysqlVarchar } from "drizzle-orm/mysql-core";
import { pgTable, text as pgText } from "drizzle-orm/pg-core";

export const pgProjects = pgTable("projects", {
  id: pgText("id").primaryKey(),
  owner_user_id: pgText("owner_user_id"),
  title: pgText("title").notNull(),
  description: pgText("description"),
  visibility: pgText("visibility").notNull().default("private"),
  created_at: pgText("created_at").notNull(),
  updated_at: pgText("updated_at").notNull(),
});

export const pgProjectMembers = pgTable("project_members", {
  id: pgText("id").primaryKey(),
  project_id: pgText("project_id").notNull(),
  user_id: pgText("user_id").notNull(),
  role: pgText("role").notNull(),
  created_at: pgText("created_at").notNull(),
});

export const mysqlProjects = mysqlTable("projects", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  owner_user_id: mysqlVarchar("owner_user_id", { length: 191 }),
  title: mysqlText("title").notNull(),
  description: mysqlText("description"),
  visibility: mysqlVarchar("visibility", { length: 20 }).notNull().default("private"),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
  updated_at: mysqlVarchar("updated_at", { length: 40 }).notNull(),
});

export const mysqlProjectMembers = mysqlTable("project_members", {
  id: mysqlVarchar("id", { length: 191 }).primaryKey(),
  project_id: mysqlVarchar("project_id", { length: 191 }).notNull(),
  user_id: mysqlVarchar("user_id", { length: 191 }).notNull(),
  role: mysqlVarchar("role", { length: 20 }).notNull(),
  created_at: mysqlVarchar("created_at", { length: 40 }).notNull(),
});
