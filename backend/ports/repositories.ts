import type { Chat, ChatMessageRole, ChatWithMessages } from "@/backend/domain/chat";
import type { Project } from "@/backend/domain/project";
import type { User } from "@/backend/domain/user";

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
  listForUser(userId: string): Promise<Chat[]>;
  getByIdForUser(chatId: string, userId: string): Promise<ChatWithMessages | null>;
  createWithInitialMessages(input: CreateChatWithMessagesInput): Promise<ChatWithMessages>;
  appendMessages(input: AppendChatMessagesInput): Promise<ChatWithMessages | null>;
}

export interface RepositoryBundle {
  users: UserRepository;
  roles: RoleRepository;
  projects: ProjectRepository;
  chats: ChatRepository;
}
