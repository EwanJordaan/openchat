import { sql } from "drizzle-orm";

import { ensureDatabase } from "@/lib/db/bootstrap";
import { getDb } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import type {
  Actor,
  ChatMessage,
  ChatSummary,
  ModelOption,
  PublicAppSettings,
  Role,
  RoleLimit,
  UploadedFile,
  UserSettings,
} from "@/lib/types";
import { asNumber, createId, nowIso, parseJson, toBool } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  image_url: string | null;
  is_active: number | boolean;
}

interface SessionJoinRow {
  user_id: string;
  expires_at: string;
  email: string;
  name: string;
  image_url: string | null;
  is_active: number | boolean;
}

const defaultUserSettings: UserSettings = {
  theme: "system",
  compactMode: false,
  enterToSend: true,
  showTokens: false,
  timezone: "UTC",
  language: "en",
  autoTitleChats: true,
};

export async function findUserByEmail(email: string) {
  await ensureDatabase();
  const { query } = getDb();
  const normalized = email.trim().toLowerCase();
  const rows = await query<UserRow>(
    sql`select id, email, password_hash, name, image_url, is_active from users where lower(email) = ${normalized} limit 1`,
  );
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<UserRow>(
    sql`select id, email, password_hash, name, image_url, is_active from users where id = ${userId} limit 1`,
  );
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
}) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const now = nowIso();
  const userId = createId("usr");
  const normalized = input.email.trim().toLowerCase();

  if (provider === "mysql") {
    await query(
      sql`insert into users (id, email, password_hash, name, image_url, is_active, created_at, updated_at)
          values (${userId}, ${normalized}, ${input.passwordHash}, ${input.name}, ${null}, ${1}, ${now}, ${now})`,
    );
    await query(
      sql`insert ignore into user_roles (id, user_id, role, created_at)
          values (${createId("url")}, ${userId}, ${"user"}, ${now})`,
    );
  } else {
    await query(
      sql`insert into users (id, email, password_hash, name, image_url, is_active, created_at, updated_at)
          values (${userId}, ${normalized}, ${input.passwordHash}, ${input.name}, ${null}, ${1}, ${now}, ${now})`,
    );
    await query(
      sql`insert into user_roles (id, user_id, role, created_at)
          values (${createId("url")}, ${userId}, ${"user"}, ${now})
          on conflict (user_id, role) do nothing`,
    );
  }

  return { id: userId, email: normalized, name: input.name };
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<{ role: Role }>(
    sql`select role from user_roles where user_id = ${userId}`,
  );
  const roles = rows.map((row) => row.role);
  if (!roles.length) return ["user"];
  return roles;
}

export async function setUserRoles(userId: string, roles: Role[]) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const deduped = Array.from(new Set(roles));
  const now = nowIso();

  await query(sql`delete from user_roles where user_id = ${userId}`);
  for (const role of deduped) {
    if (provider === "mysql") {
      await query(
        sql`insert ignore into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${role}, ${now})`,
      );
    } else {
      await query(
        sql`insert into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${role}, ${now}) on conflict (user_id, role) do nothing`,
      );
    }
  }
}

export async function createSession(userId: string, tokenHash: string, expiresAt: string) {
  await ensureDatabase();
  const { query } = getDb();
  await query(
    sql`insert into sessions (id, user_id, token_hash, expires_at, created_at)
        values (${createId("ses")}, ${userId}, ${tokenHash}, ${expiresAt}, ${nowIso()})`,
  );
}

export async function deleteSessionByTokenHash(tokenHash: string) {
  await ensureDatabase();
  const { query } = getDb();
  await query(sql`delete from sessions where token_hash = ${tokenHash}`);
}

export async function deleteExpiredSessions() {
  await ensureDatabase();
  const { query } = getDb();
  await query(sql`delete from sessions where expires_at < ${nowIso()}`);
}

export async function getSessionUser(tokenHash: string) {
  await ensureDatabase();
  await deleteExpiredSessions();
  const { query } = getDb();

  const rows = await query<SessionJoinRow>(sql`
    select s.user_id, s.expires_at, u.email, u.name, u.image_url, u.is_active
    from sessions s
    inner join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
    limit 1
  `);

  const row = rows[0];
  if (!row || !toBool(row.is_active)) return null;

  const roles = await getUserRoles(row.user_id);
  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      imageUrl: row.image_url,
    },
    roles,
  };
}

export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<{ setting_key: string; value_json: string }>(
    sql`select setting_key, value_json from app_settings where setting_key in (${"guest_enabled"}, ${"guest_allowed_models"}, ${"default_model_id"})`,
  );

  const byKey = new Map(rows.map((row) => [row.setting_key, row.value_json]));
  return {
    guestEnabled: parseJson(byKey.get("guest_enabled"), true),
    guestAllowedModels: parseJson(byKey.get("guest_allowed_models"), ["gpt-4o-mini"]),
    defaultModelId: parseJson(byKey.get("default_model_id"), "gpt-4o-mini"),
  };
}

export async function updatePublicAppSettings(payload: Partial<PublicAppSettings>) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const now = nowIso();

  const entries: Array<[string, string]> = [];
  if (payload.guestEnabled != null) entries.push(["guest_enabled", JSON.stringify(payload.guestEnabled)]);
  if (payload.guestAllowedModels != null) {
    entries.push(["guest_allowed_models", JSON.stringify(payload.guestAllowedModels)]);
  }
  if (payload.defaultModelId != null) entries.push(["default_model_id", JSON.stringify(payload.defaultModelId)]);

  for (const [settingKey, valueJson] of entries) {
    if (provider === "mysql") {
      await query(sql`
        insert into app_settings (setting_key, value_json, updated_at)
        values (${settingKey}, ${valueJson}, ${now})
        on duplicate key update value_json = values(value_json), updated_at = values(updated_at)
      `);
    } else {
      await query(sql`
        insert into app_settings (setting_key, value_json, updated_at)
        values (${settingKey}, ${valueJson}, ${now})
        on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at
      `);
    }
  }
}

function mapModel(row: Record<string, unknown>): ModelOption {
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? row.displayName ?? row.id),
    provider: String(row.provider),
    description: String(row.description ?? ""),
    isEnabled: toBool(row.is_enabled),
    isDefault: toBool(row.is_default),
    isGuestAllowed: toBool(row.is_guest_allowed),
    maxOutputTokens: asNumber(row.max_output_tokens, 2048),
  };
}

export async function listModels() {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens from models order by is_default desc, display_name asc`,
  );
  return rows.map(mapModel);
}

export async function listModelsForActor(actor: Actor) {
  const allModels = await listModels();
  const settings = await getPublicAppSettings();

  if (actor.type === "guest") {
    const allowSet = new Set(settings.guestAllowedModels);
    return allModels.filter((model) => model.isEnabled && model.isGuestAllowed && allowSet.has(model.id));
  }

  return allModels.filter((model) => model.isEnabled);
}

export async function updateModel(
  modelId: string,
  patch: Partial<Pick<ModelOption, "displayName" | "description" | "isEnabled" | "isDefault" | "isGuestAllowed" | "maxOutputTokens">>,
) {
  await ensureDatabase();
  const { query } = getDb();
  const now = nowIso();

  const currentRows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens from models where id = ${modelId} limit 1`,
  );
  const current = currentRows[0];
  if (!current) return null;

  const next = {
    displayName: patch.displayName ?? String(current.display_name),
    description: patch.description ?? String(current.description),
    isEnabled: patch.isEnabled ?? toBool(current.is_enabled),
    isDefault: patch.isDefault ?? toBool(current.is_default),
    isGuestAllowed: patch.isGuestAllowed ?? toBool(current.is_guest_allowed),
    maxOutputTokens: patch.maxOutputTokens ?? asNumber(current.max_output_tokens, 2048),
  };

  await query(sql`
    update models
    set
      display_name = ${next.displayName},
      description = ${next.description},
      is_enabled = ${next.isEnabled ? 1 : 0},
      is_default = ${next.isDefault ? 1 : 0},
      is_guest_allowed = ${next.isGuestAllowed ? 1 : 0},
      max_output_tokens = ${next.maxOutputTokens},
      updated_at = ${now}
    where id = ${modelId}
  `);

  if (next.isDefault) {
    await query(sql`update models set is_default = 0 where id <> ${modelId}`);
    await updatePublicAppSettings({ defaultModelId: modelId });
  }

  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens from models where id = ${modelId} limit 1`,
  );
  return rows[0] ? mapModel(rows[0]) : null;
}

export async function listProviders() {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, base_url, encrypted_api_key, is_enabled, updated_at from provider_credentials order by provider asc`,
  );

  return rows.map((row) => ({
    id: String(row.id),
    provider: String(row.provider),
    baseUrl: String(row.base_url),
    hasApiKey: Boolean(row.encrypted_api_key),
    isEnabled: toBool(row.is_enabled),
    updatedAt: String(row.updated_at),
  }));
}

export async function getProviderCredential(providerName: string) {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select provider, base_url, encrypted_api_key, is_enabled from provider_credentials where provider = ${providerName} limit 1`,
  );
  const row = rows[0];
  if (!row) return null;

  return {
    provider: String(row.provider),
    baseUrl: String(row.base_url),
    apiKey: decryptSecret(String(row.encrypted_api_key || "")),
    isEnabled: toBool(row.is_enabled),
  };
}

export async function upsertProviderCredential(input: {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  isEnabled: boolean;
}) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const now = nowIso();
  const encryptedApiKey = input.apiKey ? encryptSecret(input.apiKey) : null;

  if (provider === "mysql") {
    await query(sql`
      insert into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
      values (${createId("prv")}, ${input.provider}, ${input.baseUrl}, ${encryptedApiKey}, ${input.isEnabled ? 1 : 0}, ${now})
      on duplicate key update
        base_url = values(base_url),
        encrypted_api_key = coalesce(values(encrypted_api_key), encrypted_api_key),
        is_enabled = values(is_enabled),
        updated_at = values(updated_at)
    `);
    return;
  }

  await query(sql`
    insert into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
    values (${createId("prv")}, ${input.provider}, ${input.baseUrl}, ${encryptedApiKey}, ${input.isEnabled ? 1 : 0}, ${now})
    on conflict (provider) do update
    set
      base_url = excluded.base_url,
      encrypted_api_key = coalesce(excluded.encrypted_api_key, provider_credentials.encrypted_api_key),
      is_enabled = excluded.is_enabled,
      updated_at = excluded.updated_at
  `);
}

export async function listRoleLimits(): Promise<RoleLimit[]> {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select role, daily_message_limit, max_attachment_count, max_attachment_mb from role_limits`,
  );
  return rows.map((row) => ({
    role: String(row.role) as Role,
    dailyMessageLimit: asNumber(row.daily_message_limit, 500),
    maxAttachmentCount: asNumber(row.max_attachment_count, 5),
    maxAttachmentMb: asNumber(row.max_attachment_mb, 12),
  }));
}

export async function getRoleLimit(role: Role): Promise<RoleLimit> {
  const rows = await listRoleLimits();
  const matched = rows.find((item) => item.role === role);
  if (matched) return matched;
  return {
    role,
    dailyMessageLimit: role === "admin" ? 5000 : role === "user" ? 800 : 10000,
    maxAttachmentCount: role === "admin" ? 10 : role === "user" ? 5 : 2,
    maxAttachmentMb: role === "admin" ? 20 : role === "user" ? 12 : 8,
  };
}

export async function upsertRoleLimit(limit: RoleLimit) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const now = nowIso();

  if (provider === "mysql") {
    await query(sql`
      insert into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
      values (${createId("rlm")}, ${limit.role}, ${limit.dailyMessageLimit}, ${limit.maxAttachmentCount}, ${limit.maxAttachmentMb}, ${now})
      on duplicate key update
        daily_message_limit = values(daily_message_limit),
        max_attachment_count = values(max_attachment_count),
        max_attachment_mb = values(max_attachment_mb),
        updated_at = values(updated_at)
    `);
    return;
  }

  await query(sql`
    insert into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
    values (${createId("rlm")}, ${limit.role}, ${limit.dailyMessageLimit}, ${limit.maxAttachmentCount}, ${limit.maxAttachmentMb}, ${now})
    on conflict (role) do update
    set
      daily_message_limit = excluded.daily_message_limit,
      max_attachment_count = excluded.max_attachment_count,
      max_attachment_mb = excluded.max_attachment_mb,
      updated_at = excluded.updated_at
  `);
}

export async function createChat(actor: Actor, title: string, modelId: string) {
  await ensureDatabase();
  const { query } = getDb();
  const now = nowIso();
  const chatId = createId("cht");

  await query(sql`
    insert into chats (id, user_id, guest_id, title, model_id, archived, created_at, updated_at)
    values (
      ${chatId},
      ${actor.type === "user" ? actor.userId : null},
      ${actor.guestId},
      ${title},
      ${modelId},
      ${0},
      ${now},
      ${now}
    )
  `);

  return chatId;
}

export async function listChats(actor: Actor): Promise<ChatSummary[]> {
  await ensureDatabase();
  const { query } = getDb();
  const rows = actor.type === "user"
    ? await query<Record<string, unknown>>(
        sql`select id, title, model_id, created_at, updated_at from chats where user_id = ${actor.userId} and archived = 0 order by updated_at desc`,
      )
    : await query<Record<string, unknown>>(
        sql`select id, title, model_id, created_at, updated_at from chats where user_id is null and guest_id = ${actor.guestId} and archived = 0 order by updated_at desc`,
      );

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    modelId: String(row.model_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function getChat(actor: Actor, chatId: string) {
  await ensureDatabase();
  const { query } = getDb();

  const chatRows = actor.type === "user"
    ? await query<Record<string, unknown>>(
        sql`select id, title, model_id, created_at, updated_at from chats where id = ${chatId} and user_id = ${actor.userId} limit 1`,
      )
    : await query<Record<string, unknown>>(
        sql`select id, title, model_id, created_at, updated_at from chats where id = ${chatId} and user_id is null and guest_id = ${actor.guestId} limit 1`,
      );

  const chat = chatRows[0];
  if (!chat) return null;

  const messageRows = await query<Record<string, unknown>>(
    sql`select id, chat_id, role, content, model_id, attachments_json, created_at from messages where chat_id = ${chatId} order by created_at asc, id asc`,
  );

  const messages: ChatMessage[] = messageRows.map((row) => ({
    id: String(row.id),
    chatId: String(row.chat_id),
    role: String(row.role) as "user" | "assistant" | "system",
    content: String(row.content),
    modelId: String(row.model_id),
    createdAt: String(row.created_at),
    attachments: parseJson<UploadedFile[]>(row.attachments_json, []),
  }));

  return {
    id: String(chat.id),
    title: String(chat.title),
    modelId: String(chat.model_id),
    createdAt: String(chat.created_at),
    updatedAt: String(chat.updated_at),
    messages,
  };
}

export async function rewriteUserMessageAndTrimFollowing(
  actor: Actor,
  input: {
    chatId: string;
    messageId: string;
    content: string;
  },
) {
  await ensureDatabase();
  const { withTransaction } = getDb();

  return withTransaction(async (tx) => {
    const chatRows = actor.type === "user"
      ? await tx.query<Record<string, unknown>>(
          sql`select id from chats where id = ${input.chatId} and user_id = ${actor.userId} limit 1`,
        )
      : await tx.query<Record<string, unknown>>(
          sql`select id from chats where id = ${input.chatId} and user_id is null and guest_id = ${actor.guestId} limit 1`,
        );

    if (!chatRows[0]) {
      return { ok: false as const, reason: "chat-not-found" as const };
    }

    const messageRows = await tx.query<Record<string, unknown>>(
      sql`select id, role from messages where chat_id = ${input.chatId} order by created_at asc, id asc`,
    );
    const targetIndex = messageRows.findIndex((row) => String(row.id) === input.messageId);
    if (targetIndex === -1) {
      return { ok: false as const, reason: "message-not-found" as const };
    }

    if (String(messageRows[targetIndex]?.role) !== "user") {
      return { ok: false as const, reason: "not-user-message" as const };
    }

    const laterMessageIds = messageRows.slice(targetIndex + 1).map((row) => String(row.id));
    const now = nowIso();

    await tx.query(sql`
      update messages
      set content = ${input.content}
      where id = ${input.messageId} and chat_id = ${input.chatId}
    `);

    if (laterMessageIds.length) {
      await tx.query(sql`
        delete from messages
        where chat_id = ${input.chatId}
          and id in (${sql.join(laterMessageIds.map((messageId) => sql`${messageId}`), sql`, `)})
      `);
    }

    await tx.query(sql`update chats set updated_at = ${now} where id = ${input.chatId}`);

    return {
      ok: true as const,
      removedMessageIds: laterMessageIds,
    };
  });
}

export async function renameChat(actor: Actor, chatId: string, title: string) {
  await ensureDatabase();
  const { query } = getDb();
  const now = nowIso();

  if (actor.type === "user") {
    await query(
      sql`update chats set title = ${title}, updated_at = ${now} where id = ${chatId} and user_id = ${actor.userId}`,
    );
    return;
  }
  await query(
    sql`update chats set title = ${title}, updated_at = ${now} where id = ${chatId} and user_id is null and guest_id = ${actor.guestId}`,
  );
}

export async function archiveChat(actor: Actor, chatId: string) {
  await ensureDatabase();
  const { query } = getDb();
  const now = nowIso();

  if (actor.type === "user") {
    await query(
      sql`update chats set archived = 1, updated_at = ${now} where id = ${chatId} and user_id = ${actor.userId}`,
    );
    return;
  }
  await query(
    sql`update chats set archived = 1, updated_at = ${now} where id = ${chatId} and user_id is null and guest_id = ${actor.guestId}`,
  );
}

export async function appendMessage(input: {
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId: string;
  attachments?: UploadedFile[];
}) {
  await ensureDatabase();
  const { query } = getDb();
  const now = nowIso();
  const messageId = createId("msg");

  await query(sql`
    insert into messages (id, chat_id, role, content, model_id, attachments_json, created_at)
    values (${messageId}, ${input.chatId}, ${input.role}, ${input.content}, ${input.modelId}, ${JSON.stringify(input.attachments ?? [])}, ${now})
  `);

  await query(sql`update chats set updated_at = ${now} where id = ${input.chatId}`);
  return messageId;
}

export async function touchFilesWithChat(fileIds: string[], chatId: string) {
  await ensureDatabase();
  if (!fileIds.length) return;
  const { query } = getDb();
  for (const fileId of fileIds) {
    await query(sql`update files set chat_id = ${chatId} where id = ${fileId}`);
  }
}

export async function createFileRecord(input: {
  ownerUserId: string | null;
  guestId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}) {
  await ensureDatabase();
  const { query } = getDb();
  const fileId = createId("fil");
  await query(sql`
    insert into files (id, owner_user_id, guest_id, chat_id, file_name, mime_type, size_bytes, storage_path, created_at)
    values (${fileId}, ${input.ownerUserId}, ${input.guestId}, ${null}, ${input.fileName}, ${input.mimeType}, ${input.sizeBytes}, ${input.storagePath}, ${nowIso()})
  `);
  return fileId;
}

export async function getOwnedFiles(actor: Actor, fileIds: string[]): Promise<UploadedFile[]> {
  await ensureDatabase();
  if (!fileIds.length) return [];
  const { query } = getDb();
  const ownershipFilter = actor.type === "user"
    ? sql`(owner_user_id = ${actor.userId} or guest_id = ${actor.guestId})`
    : sql`owner_user_id is null and guest_id = ${actor.guestId}`;

  const rows = await query<Record<string, unknown>>(sql`
    select id, file_name, mime_type, size_bytes, storage_path
    from files
    where id in (${sql.join(fileIds.map((fileId) => sql`${fileId}`), sql`, `)})
      and ${ownershipFilter}
  `);

  const byId = new Map(
    rows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        fileName: String(row.file_name),
        mimeType: String(row.mime_type),
        sizeBytes: asNumber(row.size_bytes, 0),
        storagePath: String(row.storage_path),
      } satisfies UploadedFile,
    ]),
  );

  const files: UploadedFile[] = [];
  for (const fileId of fileIds) {
    const file = byId.get(fileId);
    if (file) files.push(file);
  }

  return files;
}

export async function checkAndConsumeMessageQuota(actor: Actor) {
  if (actor.type === "guest") {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  await ensureDatabase();
  const { query, provider } = getDb();
  const dateKey = nowIso().slice(0, 10);
  const role = actor.roles.includes("admin") ? "admin" : "user";
  const limit = await getRoleLimit(role);
  const rows = await query<Record<string, unknown>>(
    sql`select id, message_count from usage_counters where user_id = ${actor.userId} and date_key = ${dateKey} limit 1`,
  );

  const existing = rows[0];
  const currentCount = existing ? asNumber(existing.message_count, 0) : 0;
  if (currentCount >= limit.dailyMessageLimit) {
    return { allowed: false, remaining: 0 };
  }

  const nextCount = currentCount + 1;
  const now = nowIso();
  if (!existing) {
    if (provider === "mysql") {
      await query(sql`
        insert ignore into usage_counters (id, user_id, date_key, message_count, token_count, updated_at)
        values (${createId("usg")}, ${actor.userId}, ${dateKey}, ${nextCount}, ${0}, ${now})
      `);
    } else {
      await query(sql`
        insert into usage_counters (id, user_id, date_key, message_count, token_count, updated_at)
        values (${createId("usg")}, ${actor.userId}, ${dateKey}, ${nextCount}, ${0}, ${now})
        on conflict (user_id, date_key) do update set message_count = excluded.message_count, updated_at = excluded.updated_at
      `);
    }
  } else {
    await query(sql`
      update usage_counters
      set message_count = ${nextCount}, updated_at = ${now}
      where user_id = ${actor.userId} and date_key = ${dateKey}
    `);
  }

  return { allowed: true, remaining: Math.max(0, limit.dailyMessageLimit - nextCount) };
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  await ensureDatabase();
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select theme, compact_mode, enter_to_send, show_tokens, timezone, language, auto_title_chats from user_settings where user_id = ${userId} limit 1`,
  );
  const row = rows[0];
  if (!row) return defaultUserSettings;

  return {
    theme: String(row.theme) as UserSettings["theme"],
    compactMode: toBool(row.compact_mode),
    enterToSend: toBool(row.enter_to_send),
    showTokens: toBool(row.show_tokens),
    timezone: String(row.timezone),
    language: String(row.language),
    autoTitleChats: toBool(row.auto_title_chats),
  };
}

export async function upsertUserSettings(userId: string, settings: Partial<UserSettings>) {
  await ensureDatabase();
  const { query, provider } = getDb();
  const current = await getUserSettings(userId);
  const next: UserSettings = {
    ...current,
    ...settings,
  };
  const now = nowIso();

  if (provider === "mysql") {
    await query(sql`
      insert into user_settings (user_id, theme, compact_mode, enter_to_send, show_tokens, timezone, language, auto_title_chats, updated_at)
      values (${userId}, ${next.theme}, ${next.compactMode ? 1 : 0}, ${next.enterToSend ? 1 : 0}, ${next.showTokens ? 1 : 0}, ${next.timezone}, ${next.language}, ${next.autoTitleChats ? 1 : 0}, ${now})
      on duplicate key update
        theme = values(theme),
        compact_mode = values(compact_mode),
        enter_to_send = values(enter_to_send),
        show_tokens = values(show_tokens),
        timezone = values(timezone),
        language = values(language),
        auto_title_chats = values(auto_title_chats),
        updated_at = values(updated_at)
    `);
  } else {
    await query(sql`
      insert into user_settings (user_id, theme, compact_mode, enter_to_send, show_tokens, timezone, language, auto_title_chats, updated_at)
      values (${userId}, ${next.theme}, ${next.compactMode ? 1 : 0}, ${next.enterToSend ? 1 : 0}, ${next.showTokens ? 1 : 0}, ${next.timezone}, ${next.language}, ${next.autoTitleChats ? 1 : 0}, ${now})
      on conflict (user_id) do update
      set
        theme = excluded.theme,
        compact_mode = excluded.compact_mode,
        enter_to_send = excluded.enter_to_send,
        show_tokens = excluded.show_tokens,
        timezone = excluded.timezone,
        language = excluded.language,
        auto_title_chats = excluded.auto_title_chats,
        updated_at = excluded.updated_at
    `);
  }

  return next;
}

export async function listUsersWithRoles() {
  await ensureDatabase();
  const { query } = getDb();

  const users = await query<Record<string, unknown>>(
    sql`select id, email, name, is_active, created_at from users order by created_at desc limit 200`,
  );

  const userIds = users.map((user) => String(user.id));
  if (!userIds.length) return [];

  const roleRows = await query<{ user_id: string; role: Role }>(sql`
    select user_id, role
    from user_roles
    where user_id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const rolesByUser = new Map<string, Role[]>();
  for (const row of roleRows) {
    const key = String(row.user_id);
    const roles = rolesByUser.get(key) ?? [];
    roles.push(row.role);
    rolesByUser.set(key, roles);
  }

  const result = [] as Array<{
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    roles: Role[];
  }>;

  for (const user of users) {
    const roles = rolesByUser.get(String(user.id)) ?? ["user"];
    result.push({
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      isActive: toBool(user.is_active),
      createdAt: String(user.created_at),
      roles,
    });
  }

  return result;
}

export async function logAudit(input: {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}) {
  await ensureDatabase();
  const { query } = getDb();
  await query(sql`
    insert into audit_logs (id, actor_user_id, action, target_type, target_id, payload_json, created_at)
    values (${createId("adt")}, ${input.actorUserId}, ${input.action}, ${input.targetType}, ${input.targetId ?? null}, ${JSON.stringify(input.payload ?? {})}, ${nowIso()})
  `);
}
