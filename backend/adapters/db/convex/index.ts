import type { Chat, ChatMessage, ChatWithMessages } from "@/backend/domain/chat";
import type { Project } from "@/backend/domain/project";
import type { User } from "@/backend/domain/user";
import type {
  AiUsageRepository,
  AppendChatMessagesInput,
  ChatRepository,
  ConsumeDailyRequestAllowanceInput,
  ConsumeDailyRequestAllowanceResult,
  CreateChatWithMessagesInput,
  CreateLocalAuthCredentialInput,
  CreateLocalAuthSessionInput,
  CreateProjectInput,
  CreateUserInput,
  LocalAuthCredential,
  LocalAuthRepository,
  LocalAuthSession,
  ProjectRepository,
  RepositoryBundle,
  RoleRepository,
  SetUserAvatarInput,
  UpsertExternalIdentityMetadataInput,
  UpdateUserProfileInput,
  UserAvatar,
  UserRepository,
} from "@/backend/ports/repositories";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

interface InMemoryUserRecord extends User {
  avatarBytes: Uint8Array | null;
}

interface InMemoryExternalIdentityMetadata {
  userId: string;
  issuer: string;
  subject: string;
  providerName: string;
  email: string | null;
  name: string | null;
  rawClaims: Record<string, unknown>;
  lastAuthenticatedAt: string;
  updatedAt: string;
}

interface InMemoryStore {
  users: Map<string, InMemoryUserRecord>;
  externalIdentities: Map<string, string>;
  externalIdentityMetadata: Map<string, InMemoryExternalIdentityMetadata>;
  rolesByName: Map<string, string>;
  userRoles: Map<string, Set<string>>;
  projects: Map<string, Project>;
  chats: Map<string, Chat>;
  chatMessagesByChatId: Map<string, ChatMessage[]>;
  aiUsageDaily: Map<string, number>;
  localAuthCredentialsByEmail: Map<string, LocalAuthCredential>;
  localAuthSessionsById: Map<string, LocalAuthSession>;
}

export function createConvexRepositories(): RepositoryBundle {
  const store = createStore();

  return {
    users: new InMemoryUserRepository(store),
    roles: new InMemoryRoleRepository(store),
    projects: new InMemoryProjectRepository(store),
    chats: new InMemoryChatRepository(store),
    aiUsage: new InMemoryAiUsageRepository(store),
    localAuth: new InMemoryLocalAuthRepository(store),
  };
}

export class ConvexUnitOfWork implements UnitOfWork {
  constructor(private readonly repositories: RepositoryBundle) {}

  async run<T>(work: (repositories: RepositoryBundle) => Promise<T>): Promise<T> {
    return work(this.repositories);
  }
}

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store: InMemoryStore) {}

  async getById(userId: string): Promise<User | null> {
    const user = this.store.users.get(userId);
    return user ? toUser(user) : null;
  }

  async getAvatar(userId: string): Promise<UserAvatar | null> {
    const user = this.store.users.get(userId);
    if (!user || !user.avatarMimeType || !user.avatarUpdatedAt || !user.avatarBytes) {
      return null;
    }

    return {
      mimeType: user.avatarMimeType,
      bytes: user.avatarBytes,
      updatedAt: user.avatarUpdatedAt,
    };
  }

  async getByExternalIdentity(issuer: string, subject: string): Promise<User | null> {
    const userId = this.store.externalIdentities.get(buildExternalIdentityKey(issuer, subject));
    if (!userId) {
      return null;
    }

    const user = this.store.users.get(userId);
    return user ? toUser(user) : null;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const user: InMemoryUserRecord = {
      id: crypto.randomUUID(),
      email: input.email ?? null,
      name: input.name ?? null,
      avatarMimeType: null,
      avatarUpdatedAt: null,
      avatarBytes: null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    this.store.users.set(user.id, user);
    return toUser(user);
  }

  async updateProfile(userId: string, input: UpdateUserProfileInput): Promise<User> {
    const user = this.requireUser(userId, "update profile");
    const now = new Date().toISOString();

    if (input.email !== undefined) {
      user.email = input.email ?? null;
    }

    if (input.name !== undefined) {
      user.name = input.name ?? null;
    }

    user.updatedAt = now;
    return toUser(user);
  }

  async setAvatar(userId: string, input: SetUserAvatarInput): Promise<User> {
    const user = this.requireUser(userId, "set avatar");
    const now = new Date().toISOString();

    user.avatarMimeType = input.mimeType;
    user.avatarBytes = new Uint8Array(input.bytes);
    user.avatarUpdatedAt = now;
    user.updatedAt = now;

    return toUser(user);
  }

  async clearAvatar(userId: string): Promise<User> {
    const user = this.requireUser(userId, "clear avatar");
    user.avatarMimeType = null;
    user.avatarBytes = null;
    user.avatarUpdatedAt = null;
    user.updatedAt = new Date().toISOString();

    return toUser(user);
  }

  async touchLastSeen(userId: string, lastSeenAtIso: string): Promise<void> {
    const user = this.store.users.get(userId);
    if (!user) {
      return;
    }

    user.lastSeenAt = lastSeenAtIso;
    user.updatedAt = new Date().toISOString();
  }

  async linkExternalIdentity(userId: string, issuer: string, subject: string): Promise<void> {
    this.requireUser(userId, "link identity");
    const key = buildExternalIdentityKey(issuer, subject);

    if (!this.store.externalIdentities.has(key)) {
      this.store.externalIdentities.set(key, userId);
    }
  }

  async upsertExternalIdentityMetadata(
    userId: string,
    issuer: string,
    subject: string,
    input: UpsertExternalIdentityMetadataInput,
  ): Promise<void> {
    this.requireUser(userId, "upsert external identity metadata");
    const key = buildExternalIdentityKey(issuer, subject);
    const now = new Date().toISOString();

    this.store.externalIdentities.set(key, userId);
    this.store.externalIdentityMetadata.set(key, {
      userId,
      issuer,
      subject,
      providerName: input.providerName,
      email: input.email ?? null,
      name: input.name ?? null,
      rawClaims: input.rawClaims ?? {},
      lastAuthenticatedAt: input.lastAuthenticatedAtIso,
      updatedAt: now,
    });
  }

  private requireUser(userId: string, action: string): InMemoryUserRecord {
    const user = this.store.users.get(userId);
    if (!user) {
      throw new Error(`Cannot ${action} for unknown user: ${userId}`);
    }

    return user;
  }
}

class InMemoryRoleRepository implements RoleRepository {
  constructor(private readonly store: InMemoryStore) {}

  async assignRoleToUser(userId: string, roleName: string): Promise<void> {
    if (!this.store.rolesByName.has(roleName)) {
      throw new Error(`Role does not exist: ${roleName}`);
    }

    let roles = this.store.userRoles.get(userId);
    if (!roles) {
      roles = new Set<string>();
      this.store.userRoles.set(userId, roles);
    }

    roles.add(roleName);
  }

  async listRoleNamesForUser(userId: string): Promise<string[]> {
    const roles = this.store.userRoles.get(userId);
    if (!roles) {
      return [];
    }

    return [...roles].sort((a, b) => a.localeCompare(b));
  }
}

class InMemoryProjectRepository implements ProjectRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listForUser(userId: string): Promise<Project[]> {
    return [...this.store.projects.values()]
      .filter((project) => project.ownerUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getByIdForUser(projectId: string, userId: string): Promise<Project | null> {
    const project = this.store.projects.get(projectId);
    if (!project || project.ownerUserId !== userId) {
      return null;
    }

    return project;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: input.id,
      ownerUserId: input.ownerUserId,
      name: input.name,
      createdAt: new Date().toISOString(),
    };

    this.store.projects.set(project.id, project);
    return project;
  }
}

class InMemoryChatRepository implements ChatRepository {
  constructor(private readonly store: InMemoryStore) {}

  async listForUser(userId: string): Promise<Chat[]> {
    return [...this.store.chats.values()]
      .filter((chat) => chat.ownerUserId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((chat) => ({ ...chat }));
  }

  async getByIdForUser(chatId: string, userId: string): Promise<ChatWithMessages | null> {
    const chat = this.store.chats.get(chatId);
    if (!chat || chat.ownerUserId !== userId) {
      return null;
    }

    const messages = this.store.chatMessagesByChatId.get(chatId) ?? [];

    return {
      chat: { ...chat },
      messages: messages.map((message) => ({ ...message })),
    };
  }

  async createWithInitialMessages(input: CreateChatWithMessagesInput): Promise<ChatWithMessages> {
    const now = new Date().toISOString();

    const chat: Chat = {
      id: input.chatId,
      ownerUserId: input.ownerUserId,
      title: input.title,
      createdAt: now,
      updatedAt: now,
    };

    const messages: ChatMessage[] = [
      {
        id: input.userMessageId,
        chatId: input.chatId,
        role: "user",
        content: input.userMessageContent,
        createdAt: now,
      },
      {
        id: input.assistantMessageId,
        chatId: input.chatId,
        role: "assistant",
        content: input.assistantMessageContent,
        createdAt: now,
      },
    ];

    this.store.chats.set(chat.id, chat);
    this.store.chatMessagesByChatId.set(chat.id, messages);

    return {
      chat: { ...chat },
      messages: messages.map((message) => ({ ...message })),
    };
  }

  async appendMessages(input: AppendChatMessagesInput): Promise<ChatWithMessages | null> {
    const chat = this.store.chats.get(input.chatId);
    if (!chat || chat.ownerUserId !== input.ownerUserId) {
      return null;
    }

    const now = new Date().toISOString();

    const userMessage: ChatMessage = {
      id: input.userMessageId,
      chatId: input.chatId,
      role: "user",
      content: input.userMessageContent,
      createdAt: now,
    };

    const assistantMessage: ChatMessage = {
      id: input.assistantMessageId,
      chatId: input.chatId,
      role: "assistant",
      content: input.assistantMessageContent,
      createdAt: now,
    };

    const nextMessages = [...(this.store.chatMessagesByChatId.get(input.chatId) ?? []), userMessage, assistantMessage];
    this.store.chatMessagesByChatId.set(input.chatId, nextMessages);

    const updatedChat: Chat = {
      ...chat,
      updatedAt: now,
    };

    this.store.chats.set(updatedChat.id, updatedChat);

    return {
      chat: { ...updatedChat },
      messages: nextMessages.map((message) => ({ ...message })),
    };
  }
}

class InMemoryAiUsageRepository implements AiUsageRepository {
  constructor(private readonly store: InMemoryStore) {}

  async consumeDailyRequestAllowance(
    input: ConsumeDailyRequestAllowanceInput,
  ): Promise<ConsumeDailyRequestAllowanceResult> {
    const key = buildUsageDailyKey(
      input.providerId,
      input.usageDate,
      input.subjectType,
      input.subjectId,
    );
    const currentCount = this.store.aiUsageDaily.get(key) ?? 0;

    if (currentCount >= input.limit) {
      return {
        allowed: false,
        requestCount: currentCount,
      };
    }

    const nextCount = currentCount + 1;
    this.store.aiUsageDaily.set(key, nextCount);

    return {
      allowed: true,
      requestCount: nextCount,
    };
  }
}

class InMemoryLocalAuthRepository implements LocalAuthRepository {
  constructor(private readonly store: InMemoryStore) {}

  async getCredentialByEmail(email: string): Promise<LocalAuthCredential | null> {
    const credential = this.store.localAuthCredentialsByEmail.get(normalizeEmail(email));
    if (!credential) {
      return null;
    }

    return {
      ...credential,
    };
  }

  async createCredential(input: CreateLocalAuthCredentialInput): Promise<LocalAuthCredential> {
    const email = normalizeEmail(input.email);
    if (this.store.localAuthCredentialsByEmail.has(email)) {
      throw new Error("Local auth credential already exists for this email");
    }

    const now = new Date().toISOString();
    const created: LocalAuthCredential = {
      userId: input.userId,
      email,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    this.store.localAuthCredentialsByEmail.set(email, created);

    return {
      ...created,
    };
  }

  async createSession(input: CreateLocalAuthSessionInput): Promise<LocalAuthSession> {
    const now = new Date().toISOString();
    const created: LocalAuthSession = {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.store.localAuthSessionsById.set(created.id, created);

    return {
      ...created,
    };
  }

  async getSessionById(sessionId: string): Promise<LocalAuthSession | null> {
    const session = this.store.localAuthSessionsById.get(sessionId);
    if (!session) {
      return null;
    }

    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.store.localAuthSessionsById.delete(sessionId);
      return null;
    }

    return {
      ...session,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.store.localAuthSessionsById.delete(sessionId);
  }
}

function createStore(): InMemoryStore {
  return {
    users: new Map(),
    externalIdentities: new Map(),
    externalIdentityMetadata: new Map(),
    rolesByName: new Map([
      ["admin", "role-admin"],
      ["member", "role-member"],
    ]),
    userRoles: new Map(),
    projects: new Map(),
    chats: new Map(),
    chatMessagesByChatId: new Map(),
    aiUsageDaily: new Map(),
    localAuthCredentialsByEmail: new Map(),
    localAuthSessionsById: new Map(),
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function buildUsageDailyKey(
  providerId: string,
  usageDate: string,
  subjectType: "user" | "guest",
  subjectId: string,
): string {
  return `${providerId}::${usageDate}::${subjectType}::${subjectId}`;
}

function buildExternalIdentityKey(issuer: string, subject: string): string {
  return `${issuer}::${subject}`;
}

function toUser(record: InMemoryUserRecord): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    avatarMimeType: record.avatarMimeType,
    avatarUpdatedAt: record.avatarUpdatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
  };
}
