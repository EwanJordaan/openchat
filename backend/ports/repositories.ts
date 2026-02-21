import type { Chat, ChatMessageRole, ChatWithMessages } from "@/backend/domain/chat";
import type { Project } from "@/backend/domain/project";
import type { User } from "@/backend/domain/user";
import type { ModelProviderId } from "@/shared/model-providers";

export interface CreateUserInput {
  email?: string | null;
  name?: string | null;
}

export interface UpdateUserProfileInput {
  email?: string | null;
  name?: string | null;
}

export interface UserAvatar {
  mimeType: string;
  bytes: Uint8Array;
  updatedAt: string;
}

export interface SetUserAvatarInput {
  mimeType: string;
  bytes: Uint8Array;
}

export interface UpsertExternalIdentityMetadataInput {
  providerName: string;
  email?: string | null;
  name?: string | null;
  rawClaims?: Record<string, unknown>;
  lastAuthenticatedAtIso: string;
}

export interface UserRepository {
  getById(userId: string): Promise<User | null>;
  getAvatar(userId: string): Promise<UserAvatar | null>;
  getByExternalIdentity(issuer: string, subject: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  updateProfile(userId: string, input: UpdateUserProfileInput): Promise<User>;
  setAvatar(userId: string, input: SetUserAvatarInput): Promise<User>;
  clearAvatar(userId: string): Promise<User>;
  touchLastSeen(userId: string, lastSeenAtIso: string): Promise<void>;
  linkExternalIdentity(userId: string, issuer: string, subject: string): Promise<void>;
  upsertExternalIdentityMetadata(
    userId: string,
    issuer: string,
    subject: string,
    input: UpsertExternalIdentityMetadataInput,
  ): Promise<void>;
}

export interface RoleRepository {
  assignRoleToUser(userId: string, roleName: string): Promise<void>;
  listRoleNamesForUser(userId: string): Promise<string[]>;
}

export interface CreateProjectInput {
  id: string;
  ownerUserId: string;
  name: string;
}

export interface ProjectRepository {
  listForUser(userId: string): Promise<Project[]>;
  getByIdForUser(projectId: string, userId: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
}

export interface CreateChatWithMessagesInput {
  chatId: string;
  ownerUserId: string;
  title: string;
  userMessageId: string;
  userMessageContent: string;
  assistantMessageId: string;
  assistantMessageContent: string;
}

export interface ListChatsForUserInput {
  includeArchived?: boolean;
  query?: string;
  limit?: number;
}

export interface UpdateChatMetadataInput {
  chatId: string;
  ownerUserId: string;
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface DeleteChatMessageInput {
  chatId: string;
  ownerUserId: string;
  messageId: string;
}

export interface AppendChatMessagesInput {
  chatId: string;
  ownerUserId: string;
  userMessageId: string;
  userMessageContent: string;
  assistantMessageId: string;
  assistantMessageContent: string;
}

export interface CreateChatMessageInput {
  id: string;
  chatId: string;
  role: ChatMessageRole;
  content: string;
}

export interface ChatRepository {
  listForUser(userId: string, input?: ListChatsForUserInput): Promise<Chat[]>;
  getByIdForUser(chatId: string, userId: string): Promise<ChatWithMessages | null>;
  createWithInitialMessages(input: CreateChatWithMessagesInput): Promise<ChatWithMessages>;
  appendMessages(input: AppendChatMessagesInput): Promise<ChatWithMessages | null>;
  updateMetadata(input: UpdateChatMetadataInput): Promise<Chat | null>;
  deleteMessage(input: DeleteChatMessageInput): Promise<ChatWithMessages | null>;
}

export interface ConsumeDailyRequestAllowanceInput {
  providerId: ModelProviderId;
  usageDate: string;
  subjectType: "user" | "guest";
  subjectId: string;
  limit: number;
}

export interface ConsumeDailyRequestAllowanceResult {
  allowed: boolean;
  requestCount: number;
}

export interface AiUsageRepository {
  consumeDailyRequestAllowance(
    input: ConsumeDailyRequestAllowanceInput,
  ): Promise<ConsumeDailyRequestAllowanceResult>;
}

export interface LocalAuthCredential {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAuthSession {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocalAuthCredentialInput {
  userId: string;
  email: string;
  passwordHash: string;
}

export interface CreateLocalAuthSessionInput {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface LocalAuthRepository {
  getCredentialByEmail(email: string): Promise<LocalAuthCredential | null>;
  createCredential(input: CreateLocalAuthCredentialInput): Promise<LocalAuthCredential>;
  createSession(input: CreateLocalAuthSessionInput): Promise<LocalAuthSession>;
  getSessionById(sessionId: string): Promise<LocalAuthSession | null>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface RepositoryBundle {
  users: UserRepository;
  roles: RoleRepository;
  projects: ProjectRepository;
  chats: ChatRepository;
  aiUsage: AiUsageRepository;
  localAuth: LocalAuthRepository;
}
