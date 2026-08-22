export * from "./auth";
export * from "./projects";
export * from "./docs";
export * from "./chats";
export * from "./settings";

import {
  pgAuthAccounts,
  pgAuthSessions,
  pgAuthVerifications,
  pgSessions,
  pgUserRoles,
  pgUsers,
  mysqlAuthAccounts,
  mysqlAuthSessions,
  mysqlAuthVerifications,
  mysqlSessions,
  mysqlUserRoles,
  mysqlUsers,
} from "./auth";
import { mysqlDocumentChunks, mysqlDocuments, pgDocumentChunks, pgDocuments } from "./docs";
import { mysqlChats, mysqlMessages, mysqlToolEvents, pgChats, pgMessages, pgToolEvents } from "./chats";
import { mysqlProjectMembers, mysqlProjects, pgProjectMembers, pgProjects } from "./projects";
import {
  mysqlAppSettings,
  mysqlAuditLogs,
  mysqlEmbedModels,
  mysqlModels,
  mysqlProviderCredentials,
  mysqlRoleLimits,
  mysqlUsageCounters,
  mysqlUserSettings,
  pgAppSettings,
  pgAuditLogs,
  pgEmbedModels,
  pgModels,
  pgProviderCredentials,
  pgRoleLimits,
  pgUsageCounters,
  pgUserSettings,
} from "./settings";

// Full schemas for drizzle client / drizzle-kit introspection
export const pgSchema = {
  users: pgUsers,
  user_roles: pgUserRoles,
  sessions: pgSessions,
  auth_sessions: pgAuthSessions,
  auth_accounts: pgAuthAccounts,
  auth_verifications: pgAuthVerifications,
  projects: pgProjects,
  project_members: pgProjectMembers,
  documents: pgDocuments,
  document_chunks: pgDocumentChunks,
  chats: pgChats,
  messages: pgMessages,
  tool_events: pgToolEvents,
  app_settings: pgAppSettings,
  provider_credentials: pgProviderCredentials,
  models: pgModels,
  embed_models: pgEmbedModels,
  role_limits: pgRoleLimits,
  user_settings: pgUserSettings,
  usage_counters: pgUsageCounters,
  audit_logs: pgAuditLogs,
};

export const mysqlSchema = {
  users: mysqlUsers,
  user_roles: mysqlUserRoles,
  sessions: mysqlSessions,
  auth_sessions: mysqlAuthSessions,
  auth_accounts: mysqlAuthAccounts,
  auth_verifications: mysqlAuthVerifications,
  projects: mysqlProjects,
  project_members: mysqlProjectMembers,
  documents: mysqlDocuments,
  document_chunks: mysqlDocumentChunks,
  chats: mysqlChats,
  messages: mysqlMessages,
  tool_events: mysqlToolEvents,
  app_settings: mysqlAppSettings,
  provider_credentials: mysqlProviderCredentials,
  models: mysqlModels,
  embed_models: mysqlEmbedModels,
  role_limits: mysqlRoleLimits,
  user_settings: mysqlUserSettings,
  usage_counters: mysqlUsageCounters,
  audit_logs: mysqlAuditLogs,
};

// Keep legacy names for backwards compat
export { pgAuthSchema, mysqlAuthSchema } from "./auth";
