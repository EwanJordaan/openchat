import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { createId, nowIso, parseJson, toBool, asNumber } from "@/lib/utils";
import type {
  Actor,
  AgentPreset,
  ChatMessage,
  ChatSummary,
  Citation,
  Document,
  ModelOption,
  Project,
  PublicAppSettings,
  Role,
  RoleLimit,
  ToolCall,
  ToolEvent,
  UserSettings,
} from "@/lib/types";

// --- helpers ---
function rowToProject(row: {
  id: string;
  owner_user_id: string | null;
  title: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}): Project {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    description: row.description,
    visibility: (row.visibility as "private" | "public") || "private",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDocument(row: {
  id: string;
  project_id: string | null;
  owner_user_id: string | null;
  guest_id: string | null;
  title: string;
  source_type: string;
  source_url: string | null;
  mime_type: string | null;
  storage_key: string | null;
  sha256: string | null;
  page_count: number | null;
  token_count: number | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}): Document {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    guestId: row.guest_id,
    title: row.title,
    sourceType: row.source_type as Document["sourceType"],
    sourceUrl: row.source_url,
    mimeType: row.mime_type,
    storageKey: row.storage_key,
    sha256: row.sha256,
    pageCount: row.page_count,
    tokenCount: row.token_count,
    status: row.status as Document["status"],
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hasProjectAccess(actor: Actor, projectId: string | null): Promise<boolean> {
  if (!projectId) return true;
  const { query } = getDb();
  const rows = await query<{ id: string }>(sql`select id from projects where id = ${projectId} limit 1`);
  if (rows.length === 0) return false;
  if (actor.type === "user") {
    const owner = await query<{ id: string }>(
      sql`select id from projects where id = ${projectId} and owner_user_id = ${actor.userId} limit 1`,
    );
    if (owner.length > 0) return true;
    const member = await query<{ id: string }>(
      sql`select id from project_members where project_id = ${projectId} and user_id = ${actor.userId} limit 1`,
    );
    if (member.length > 0) return true;
    const pub = await query<{ visibility: string }>(
      sql`select visibility from projects where id = ${projectId} limit 1`,
    );
    if (pub[0]?.visibility === "public") return true;
    return false;
  }
  const pub2 = await query<{ visibility: string }>(
    sql`select visibility from projects where id = ${projectId} limit 1`,
  );
  return pub2[0]?.visibility === "public";
}

function actorChatFilter(actor: Actor) {
  if (actor.type === "user") return sql`user_id = ${actor.userId}`;
  return sql`(user_id is null and guest_id = ${actor.guestId})`;
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

// --- projects ---
export async function getProject(actor: Actor, projectId: string): Promise<Project | null> {
  const { query } = getDb();
  const rows = await query<{
    id: string;
    owner_user_id: string | null;
    title: string;
    description: string | null;
    visibility: string;
    created_at: string;
    updated_at: string;
  }>(sql`select id, owner_user_id, title, description, visibility, created_at, updated_at from projects where id = ${projectId} limit 1`);
  if (rows.length === 0) return null;
  const ok = await hasProjectAccess(actor, projectId);
  if (!ok) return null;
  return rowToProject(rows[0]);
}

export async function listProjects(actor: Actor): Promise<Project[]> {
  const { query } = getDb();
  if (actor.type === "user") {
    const rows = await query<{
      id: string;
      owner_user_id: string | null;
      title: string;
      description: string | null;
      visibility: string;
      created_at: string;
      updated_at: string;
    }>(sql`
      select p.id, p.owner_user_id, p.title, p.description, p.visibility, p.created_at, p.updated_at
      from projects p
      left join project_members pm on pm.project_id = p.id and pm.user_id = ${actor.userId}
      where p.owner_user_id = ${actor.userId} or pm.user_id = ${actor.userId} or p.visibility = 'public'
      order by p.updated_at desc
      limit 100
    `);
    return rows.map(rowToProject);
  }
  const rows = await query<{
    id: string;
    owner_user_id: string | null;
    title: string;
    description: string | null;
    visibility: string;
    created_at: string;
    updated_at: string;
  }>(sql`select id, owner_user_id, title, description, visibility, created_at, updated_at from projects where visibility = 'public' order by updated_at desc limit 100`);
  return rows.map(rowToProject);
}

export async function createProject(
  actor: Actor,
  title: string,
  description?: string | null,
  visibility?: string,
): Promise<Project> {
  const { query } = getDb();
  const id = createId("prj");
  const now = nowIso();
  const ownerId = actor.type === "user" ? actor.userId : null;
  const vis = visibility === "public" ? "public" : "private";
  await query(
    sql`insert into projects (id, owner_user_id, title, description, visibility, created_at, updated_at) values (${id}, ${ownerId}, ${title}, ${description || null}, ${vis}, ${now}, ${now})`,
  );
  if (ownerId) {
    const mid = createId("pmb");
    await query(
      sql`insert into project_members (id, project_id, user_id, role, created_at) values (${mid}, ${id}, ${ownerId}, ${"owner"}, ${now})`,
    );
  }
  const created = await getProject(actor, id);
  if (!created) {
    return {
      id,
      ownerUserId: ownerId,
      title,
      description: description || null,
      visibility: vis as "private" | "public",
      createdAt: now,
      updatedAt: now,
    };
  }
  return created;
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  patch: { title?: string; description?: string | null; visibility?: string },
): Promise<Project | null> {
  const existing = await getProject(actor, projectId);
  if (!existing) return null;
  if (actor.type !== "user" || existing.ownerUserId !== actor.userId) {
    // only owner can update; allow admin?
    const isAdmin = actor.type === "user" && actor.roles.includes("admin");
    if (!isAdmin) return null;
  }
  const { query } = getDb();
  const now = nowIso();
  const nextTitle = patch.title ?? existing.title;
  const nextDesc = patch.description !== undefined ? patch.description : existing.description;
  const nextVis = patch.visibility ?? existing.visibility;
  await query(
    sql`update projects set title = ${nextTitle}, description = ${nextDesc}, visibility = ${nextVis}, updated_at = ${now} where id = ${projectId}`,
  );
  return getProject(actor, projectId);
}

export async function deleteProject(actor: Actor, projectId: string): Promise<boolean> {
  const existing = await getProject(actor, projectId);
  if (!existing) return false;
  if (actor.type !== "user" || existing.ownerUserId !== actor.userId) {
    const isAdmin = actor.type === "user" && actor.roles.includes("admin");
    if (!isAdmin) return false;
  }
  const { query } = getDb();
  // delete related: document_chunks already cascade via documents? but handle explicitly
  const docs = await query<{ id: string }>(sql`select id from documents where project_id = ${projectId}`);
  for (const d of docs) {
    await query(sql`delete from document_chunks where document_id = ${d.id}`);
  }
  await query(sql`delete from documents where project_id = ${projectId}`);
  await query(sql`delete from chats where project_id = ${projectId}`);
  await query(sql`delete from project_members where project_id = ${projectId}`);
  await query(sql`delete from projects where id = ${projectId}`);
  return true;
}

// --- documents ---
export async function listDocuments(actor: Actor, projectId: string): Promise<Document[]> {
  const ok = await hasProjectAccess(actor, projectId);
  if (!ok) return [];
  const { query } = getDb();
  const rows = await query<{
    id: string;
    project_id: string | null;
    owner_user_id: string | null;
    guest_id: string | null;
    title: string;
    source_type: string;
    source_url: string | null;
    mime_type: string | null;
    storage_key: string | null;
    sha256: string | null;
    page_count: number | null;
    token_count: number | null;
    status: string;
    error: string | null;
    created_at: string;
    updated_at: string;
  }>(sql`select id, project_id, owner_user_id, guest_id, title, source_type, source_url, mime_type, storage_key, sha256, page_count, token_count, status, error, created_at, updated_at from documents where project_id = ${projectId} order by updated_at desc limit 200`);
  return rows.map(rowToDocument).filter((d) => {
    if (actor.type === "user") return d.ownerUserId === actor.userId || d.guestId === actor.guestId || d.projectId === projectId;
    return d.guestId === actor.guestId || d.projectId === projectId;
  });
}

export async function getDocument(actor: Actor, documentId: string): Promise<Document | null> {
  const { query } = getDb();
  const rows = await query<{
    id: string;
    project_id: string | null;
    owner_user_id: string | null;
    guest_id: string | null;
    title: string;
    source_type: string;
    source_url: string | null;
    mime_type: string | null;
    storage_key: string | null;
    sha256: string | null;
    page_count: number | null;
    token_count: number | null;
    status: string;
    error: string | null;
    created_at: string;
    updated_at: string;
  }>(sql`select id, project_id, owner_user_id, guest_id, title, source_type, source_url, mime_type, storage_key, sha256, page_count, token_count, status, error, created_at, updated_at from documents where id = ${documentId} limit 1`);
  if (rows.length === 0) return null;
  const doc = rowToDocument(rows[0]);
  if (doc.projectId) {
    const ok = await hasProjectAccess(actor, doc.projectId);
    if (!ok && doc.ownerUserId !== actor.userId && doc.guestId !== actor.guestId) return null;
  } else if (actor.type === "user") {
    if (doc.ownerUserId !== actor.userId && doc.guestId !== actor.guestId) return null;
  } else if (doc.guestId !== actor.guestId) return null;
  return doc;
}

export async function deleteDocument(actor: Actor, documentId: string): Promise<boolean> {
  const doc = await getDocument(actor, documentId);
  if (!doc) return false;
  const { query } = getDb();
  await query(sql`delete from document_chunks where document_id = ${documentId}`);
  await query(sql`delete from documents where id = ${documentId}`);
  return true;
}

export async function createDocument(opts: {
  projectId: string | null;
  title: string;
  mime?: string;
  storageKey?: string | null;
  actor: Actor;
  sourceType?: string;
}): Promise<Document> {
  const { query } = getDb();
  const id = createId("doc");
  const now = nowIso();
  const ownerId = opts.actor.type === "user" ? opts.actor.userId : null;
  const guestId = opts.actor.guestId;
  const st = opts.sourceType || "file";
  await query(sql`
    insert into documents (id, project_id, owner_user_id, guest_id, title, source_type, source_url, mime_type, storage_key, sha256, page_count, token_count, status, error, created_at, updated_at)
    values (${id}, ${opts.projectId}, ${ownerId}, ${guestId}, ${opts.title}, ${st}, ${null}, ${opts.mime || "application/octet-stream"}, ${opts.storageKey || null}, ${null}, ${null}, ${null}, ${"pending"}, ${null}, ${now}, ${now})
  `);
  const got = await getDocument(opts.actor, id);
  if (!got) throw new Error("createDocument failed");
  return got;
}

// --- chats ---
export async function createChat(
  actor: Actor,
  opts: { title: string; modelId?: string; projectId?: string | null; agentPreset?: AgentPreset | string | null } | string,
  legacyModelId?: string,
): Promise<string> {
  const { query } = getDb();
  const now = nowIso();
  const chatId = createId("cht");
  let title: string;
  let modelId: string;
  let projectId: string | null = null;
  let agentPreset: string | null = null;
  if (typeof opts === "string") {
    title = opts;
    modelId = legacyModelId || "gpt-4o-mini";
  } else {
    title = opts.title;
    modelId = opts.modelId || "gpt-4o-mini";
    projectId = opts.projectId ?? null;
    agentPreset = (opts.agentPreset as string) ?? null;
  }
  if (projectId) {
    const ok = await hasProjectAccess(actor, projectId);
    if (!ok) throw new Error("Project access denied");
  }
  await query(sql`
    insert into chats (id, project_id, user_id, guest_id, title, model_id, agent_preset, archived, is_pinned, created_at, updated_at)
    values (${chatId}, ${projectId}, ${actor.type === "user" ? actor.userId : null}, ${actor.guestId}, ${title}, ${modelId}, ${agentPreset}, ${0}, ${0}, ${now}, ${now})
  `);
  return chatId;
}

export async function listChats(actor: Actor, projectId?: string | null): Promise<ChatSummary[]> {
  const { query } = getDb();
  const baseFilter = actorChatFilter(actor);
  let rows: Record<string, unknown>[];
  if (projectId) {
    rows = await query<Record<string, unknown>>(
      sql`select id, title, model_id, project_id, agent_preset, is_pinned, created_at, updated_at from chats where ${baseFilter} and archived = 0 and project_id = ${projectId} order by is_pinned desc, updated_at desc limit 100`,
    );
  } else {
    rows = await query<Record<string, unknown>>(
      sql`select id, title, model_id, project_id, agent_preset, is_pinned, created_at, updated_at from chats where ${baseFilter} and archived = 0 order by is_pinned desc, updated_at desc limit 100`,
    );
  }
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    modelId: String(r.model_id),
    projectId: r.project_id ? String(r.project_id) : null,
    agentPreset: (r.agent_preset as AgentPreset | null) ?? null,
    isPinned: toBool(r.is_pinned),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function getChat(actor: Actor, chatId: string) {
  const { query } = getDb();
  const filter = actorChatFilter(actor);
  const chatRows = await query<Record<string, unknown>>(
    sql`select id, title, model_id, project_id, agent_preset, is_pinned, archived, created_at, updated_at from chats where id = ${chatId} and ${filter} limit 1`,
  );
  const chat = chatRows[0];
  if (!chat) return null;
  const messages = await getChatMessages(chatId);
  const toolEvents = await getToolEventsForChat(chatId);
  return {
    id: String(chat.id),
    title: String(chat.title),
    modelId: String(chat.model_id),
    projectId: chat.project_id ? String(chat.project_id) : null,
    agentPreset: (chat.agent_preset as AgentPreset | null) ?? null,
    isPinned: toBool(chat.is_pinned),
    archived: toBool(chat.archived),
    createdAt: String(chat.created_at),
    updatedAt: String(chat.updated_at),
    messages,
    toolEvents,
  };
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, chat_id, role, content, model_id, attachments_json, tool_calls, tool_call_id, citations, token_count, created_at from messages where chat_id = ${chatId} order by created_at asc, id asc`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    chatId: String(row.chat_id),
    role: String(row.role) as ChatMessage["role"],
    content: String(row.content),
    modelId: String(row.model_id),
    createdAt: String(row.created_at),
    attachments: parseJson(row.attachments_json, []),
    toolCalls: parseJson<ToolCall[] | null>(row.tool_calls as string, null),
    toolCallId: row.tool_call_id ? String(row.tool_call_id) : null,
    citations: parseJson<Citation[] | null>(row.citations as string, null),
  }));
}

async function getToolEventsForChat(chatId: string): Promise<ToolEvent[]> {
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, chat_id, message_id, tool_name, input, output, status, latency_ms, created_at from tool_events where chat_id = ${chatId} order by created_at asc limit 100`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    chatId: String(r.chat_id),
    messageId: r.message_id ? String(r.message_id) : null,
    toolName: String(r.tool_name),
    input: parseJson(r.input, {}),
    output: r.output ? parseJson(r.output, null) : null,
    status: String(r.status) as ToolEvent["status"],
    latencyMs: r.latency_ms != null ? Number(r.latency_ms) : null,
    createdAt: String(r.created_at),
  }));
}

export async function renameChat(actor: Actor, chatId: string, title: string) {
  const { query } = getDb();
  const now = nowIso();
  const filter = actorChatFilter(actor);
  await query(sql`update chats set title = ${title}, updated_at = ${now} where id = ${chatId} and ${filter}`);
}

export async function archiveChat(actor: Actor, chatId: string) {
  const { query } = getDb();
  const now = nowIso();
  const filter = actorChatFilter(actor);
  await query(sql`update chats set archived = 1, updated_at = ${now} where id = ${chatId} and ${filter}`);
}

export async function setChatPinned(actor: Actor, chatId: string, isPinned: boolean) {
  const { query } = getDb();
  const now = nowIso();
  const filter = actorChatFilter(actor);
  await query(sql`update chats set is_pinned = ${isPinned ? 1 : 0}, updated_at = ${now} where id = ${chatId} and ${filter}`);
}

export async function appendMessage(input: {
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  modelId: string;
  attachments?: unknown[];
  citations?: Citation[] | null;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
}): Promise<string> {
  const { query } = getDb();
  const now = nowIso();
  const id = createId("msg");
  const attachmentsJson = JSON.stringify(input.attachments ?? []);
  const citationsJson = input.citations ? JSON.stringify(input.citations) : null;
  const toolCallsJson = input.toolCalls ? JSON.stringify(input.toolCalls) : null;
  await query(sql`
    insert into messages (id, chat_id, role, content, model_id, attachments_json, tool_calls, tool_call_id, citations, created_at)
    values (${id}, ${input.chatId}, ${input.role}, ${input.content}, ${input.modelId}, ${attachmentsJson}, ${toolCallsJson}, ${input.toolCallId ?? null}, ${citationsJson}, ${now})
  `);
  await query(sql`update chats set updated_at = ${now} where id = ${input.chatId}`);
  return id;
}

export async function appendToolEvent(input: {
  chatId: string;
  messageId?: string | null;
  toolName: string;
  inputJson: unknown;
  outputJson: unknown;
  status: "ok" | "error";
  latencyMs?: number | null;
}): Promise<string> {
  const { query } = getDb();
  const now = nowIso();
  const id = createId("tev");
  const inp = typeof input.inputJson === "string" ? input.inputJson : JSON.stringify(input.inputJson ?? {});
  const out = input.outputJson == null ? null : typeof input.outputJson === "string" ? input.outputJson : JSON.stringify(input.outputJson);
  await query(sql`
    insert into tool_events (id, chat_id, message_id, tool_name, input, output, status, latency_ms, created_at)
    values (${id}, ${input.chatId}, ${input.messageId ?? null}, ${input.toolName}, ${inp}, ${out}, ${input.status}, ${input.latencyMs ?? null}, ${now})
  `);
  return id;
}

// --- models ---
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
    supportsTools: toBool(row.supports_tools),
    contextWindow: row.context_window != null ? asNumber(row.context_window, 128000) : undefined,
  };
}

export async function listModels(): Promise<ModelOption[]> {
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens, supports_tools, context_window from models order by is_default desc, display_name asc`,
  );
  return rows.map(mapModel);
}

export async function listModelsForActor(actor: Actor): Promise<ModelOption[]> {
  const all = await listModels();
  const settings = await getPublicAppSettings();
  if (actor.type === "guest") {
    const allow = new Set(settings.guestAllowedModels);
    return all.filter((m) => m.isEnabled && m.isGuestAllowed && allow.has(m.id));
  }
  return all.filter((m) => m.isEnabled);
}

export async function updateModel(
  modelId: string,
  patch: Partial<Pick<ModelOption, "displayName" | "description" | "isEnabled" | "isDefault" | "isGuestAllowed" | "maxOutputTokens">>,
) {
  const { query } = getDb();
  const now = nowIso();
  const curRows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens from models where id = ${modelId} limit 1`,
  );
  const cur = curRows[0];
  if (!cur) return null;
  const next = {
    displayName: patch.displayName ?? String(cur.display_name),
    description: patch.description ?? String(cur.description),
    isEnabled: patch.isEnabled ?? toBool(cur.is_enabled),
    isDefault: patch.isDefault ?? toBool(cur.is_default),
    isGuestAllowed: patch.isGuestAllowed ?? toBool(cur.is_guest_allowed),
    maxOutputTokens: patch.maxOutputTokens ?? asNumber(cur.max_output_tokens, 2048),
  };
  await query(sql`
    update models set display_name = ${next.displayName}, description = ${next.description}, is_enabled = ${next.isEnabled ? 1 : 0}, is_default = ${next.isDefault ? 1 : 0}, is_guest_allowed = ${next.isGuestAllowed ? 1 : 0}, max_output_tokens = ${next.maxOutputTokens}, updated_at = ${now} where id = ${modelId}
  `);
  if (next.isDefault) {
    await query(sql`update models set is_default = 0 where id <> ${modelId}`);
    await updatePublicAppSettings({ defaultModelId: modelId });
  }
  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, display_name, description, is_enabled, is_default, is_guest_allowed, max_output_tokens, supports_tools, context_window from models where id = ${modelId} limit 1`,
  );
  return rows[0] ? mapModel(rows[0]) : null;
}

// --- providers ---
export async function listProviders() {
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select id, provider, base_url, encrypted_api_key, is_enabled, updated_at from provider_credentials order by provider asc`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    provider: String(r.provider),
    baseUrl: String(r.base_url),
    hasApiKey: Boolean(r.encrypted_api_key),
    isEnabled: toBool(r.is_enabled),
    updatedAt: String(r.updated_at),
  }));
}

export async function getProviderCredential(providerName: string) {
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
  const { query, provider } = getDb();
  const now = nowIso();
  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
  if (provider === "mysql") {
    await query(sql`
      insert into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
      values (${createId("prv")}, ${input.provider}, ${input.baseUrl}, ${encrypted}, ${input.isEnabled ? 1 : 0}, ${now})
      on duplicate key update base_url = values(base_url), encrypted_api_key = coalesce(values(encrypted_api_key), encrypted_api_key), is_enabled = values(is_enabled), updated_at = values(updated_at)
    `);
    return;
  }
  await query(sql`
    insert into provider_credentials (id, provider, base_url, encrypted_api_key, is_enabled, updated_at)
    values (${createId("prv")}, ${input.provider}, ${input.baseUrl}, ${encrypted}, ${input.isEnabled ? 1 : 0}, ${now})
    on conflict (provider) do update set base_url = excluded.base_url, encrypted_api_key = coalesce(excluded.encrypted_api_key, provider_credentials.encrypted_api_key), is_enabled = excluded.is_enabled, updated_at = excluded.updated_at
  `);
}

// --- role limits ---
export async function listRoleLimits(): Promise<RoleLimit[]> {
  const { query } = getDb();
  const rows = await query<Record<string, unknown>>(
    sql`select role, daily_message_limit, max_attachment_count, max_attachment_mb from role_limits`,
  );
  return rows.map((r) => ({
    role: String(r.role) as Role,
    dailyMessageLimit: asNumber(r.daily_message_limit, 500),
    maxAttachmentCount: asNumber(r.max_attachment_count, 5),
    maxAttachmentMb: asNumber(r.max_attachment_mb, 12),
  }));
}

export async function getRoleLimit(role: Role): Promise<RoleLimit> {
  const all = await listRoleLimits();
  const found = all.find((r) => r.role === role);
  if (found) return found;
  return {
    role,
    dailyMessageLimit: role === "admin" ? 5000 : role === "user" ? 800 : 10000,
    maxAttachmentCount: role === "admin" ? 10 : role === "user" ? 5 : 2,
    maxAttachmentMb: role === "admin" ? 20 : role === "user" ? 12 : 8,
  };
}

export async function upsertRoleLimit(limit: RoleLimit) {
  const { query, provider } = getDb();
  const now = nowIso();
  if (provider === "mysql") {
    await query(sql`
      insert into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
      values (${createId("rlm")}, ${limit.role}, ${limit.dailyMessageLimit}, ${limit.maxAttachmentCount}, ${limit.maxAttachmentMb}, ${now})
      on duplicate key update daily_message_limit = values(daily_message_limit), max_attachment_count = values(max_attachment_count), max_attachment_mb = values(max_attachment_mb), updated_at = values(updated_at)
    `);
    return;
  }
  await query(sql`
    insert into role_limits (id, role, daily_message_limit, max_attachment_count, max_attachment_mb, updated_at)
    values (${createId("rlm")}, ${limit.role}, ${limit.dailyMessageLimit}, ${limit.maxAttachmentCount}, ${limit.maxAttachmentMb}, ${now})
    on conflict (role) do update set daily_message_limit = excluded.daily_message_limit, max_attachment_count = excluded.max_attachment_count, max_attachment_mb = excluded.max_attachment_mb, updated_at = excluded.updated_at
  `);
}

// --- auth helpers ---
export async function findUserByEmail(email: string) {
  const { query } = getDb();
  const norm = email.trim().toLowerCase();
  const rows = await query<{ id: string; email: string; password_hash: string; name: string; image_url: string | null; is_active: number }>(
    sql`select id, email, password_hash, name, image_url, is_active from users where lower(email) = ${norm} limit 1`,
  );
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  const { query } = getDb();
  const rows = await query<{ id: string; email: string; password_hash: string; name: string; image_url: string | null; is_active: number }>(
    sql`select id, email, password_hash, name, image_url, is_active from users where id = ${userId} limit 1`,
  );
  return rows[0] ?? null;
}

export async function createUser(input: { email: string; passwordHash: string; name: string }) {
  const { query, provider } = getDb();
  const now = nowIso();
  const userId = createId("usr");
  const norm = input.email.trim().toLowerCase();
  if (provider === "mysql") {
    await query(
      sql`insert into users (id, email, password_hash, name, image_url, is_active, created_at, updated_at) values (${userId}, ${norm}, ${input.passwordHash}, ${input.name}, ${null}, ${1}, ${now}, ${now})`,
    );
    await query(sql`insert ignore into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${"user"}, ${now})`);
  } else {
    await query(
      sql`insert into users (id, email, password_hash, name, image_url, is_active, created_at, updated_at) values (${userId}, ${norm}, ${input.passwordHash}, ${input.name}, ${null}, ${1}, ${now}, ${now})`,
    );
    await query(
      sql`insert into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${"user"}, ${now}) on conflict (user_id, role) do nothing`,
    );
  }
  return { id: userId, email: norm, name: input.name };
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const { query } = getDb();
  const rows = await query<{ role: string }>(sql`select role from user_roles where user_id = ${userId}`);
  const roles = rows.map((r) => r.role as Role);
  if (roles.length === 0) return ["user"];
  return roles;
}

export async function setUserRoles(userId: string, roles: Role[]) {
  const { query, provider } = getDb();
  const dedup = Array.from(new Set(roles));
  const now = nowIso();
  await query(sql`delete from user_roles where user_id = ${userId}`);
  for (const role of dedup) {
    if (provider === "mysql") {
      await query(sql`insert ignore into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${role}, ${now})`);
    } else {
      await query(sql`insert into user_roles (id, user_id, role, created_at) values (${createId("url")}, ${userId}, ${role}, ${now}) on conflict (user_id, role) do nothing`);
    }
  }
}

export async function listUsersWithRoles() {
  const { query } = getDb();
  const users = await query<Record<string, unknown>>(sql`select id, email, name, is_active, created_at from users order by created_at desc limit 200`);
  const ids = users.map((u) => String(u.id));
  if (ids.length === 0) return [];
  const roleRows = await query<{ user_id: string; role: string }>(
    sql`select user_id, role from user_roles where user_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
  );
  const map = new Map<string, Role[]>();
  for (const r of roleRows) {
    const arr = map.get(r.user_id) ?? [];
    arr.push(r.role as Role);
    map.set(r.user_id, arr);
  }
  return users.map((u) => ({
    id: String(u.id),
    email: String(u.email),
    name: String(u.name),
    isActive: toBool(u.is_active),
    createdAt: String(u.created_at),
    roles: map.get(String(u.id)) ?? (["user"] as Role[]),
  }));
}

// --- settings ---
export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  const { query } = getDb();
  const rows = await query<{ setting_key: string; value_json: string }>(
    sql`select setting_key, value_json from app_settings where setting_key in (${"guest_enabled"}, ${"guest_allowed_models"}, ${"default_model_id"})`,
  );
  const byKey = new Map(rows.map((r) => [r.setting_key, r.value_json]));
  return {
    guestEnabled: parseJson(byKey.get("guest_enabled"), true),
    guestAllowedModels: parseJson(byKey.get("guest_allowed_models"), ["gpt-4o-mini"]),
    defaultModelId: parseJson(byKey.get("default_model_id"), "gpt-4o-mini"),
  };
}

export async function updatePublicAppSettings(payload: Partial<PublicAppSettings>) {
  const { query, provider } = getDb();
  const now = nowIso();
  const entries: Array<[string, string]> = [];
  if (payload.guestEnabled != null) entries.push(["guest_enabled", JSON.stringify(payload.guestEnabled)]);
  if (payload.guestAllowedModels != null) entries.push(["guest_allowed_models", JSON.stringify(payload.guestAllowedModels)]);
  if (payload.defaultModelId != null) entries.push(["default_model_id", JSON.stringify(payload.defaultModelId)]);
  for (const [k, v] of entries) {
    if (provider === "mysql") {
      await query(sql`insert into app_settings (setting_key, value_json, updated_at) values (${k}, ${v}, ${now}) on duplicate key update value_json = values(value_json), updated_at = values(updated_at)`);
    } else {
      await query(sql`insert into app_settings (setting_key, value_json, updated_at) values (${k}, ${v}, ${now}) on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at`);
    }
  }
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
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

export async function upsertUserSettings(userId: string, patch: Partial<UserSettings>) {
  const { query, provider } = getDb();
  const cur = await getUserSettings(userId);
  const next: UserSettings = { ...cur, ...patch };
  const now = nowIso();
  if (provider === "mysql") {
    await query(sql`
      insert into user_settings (user_id, theme, compact_mode, enter_to_send, show_tokens, timezone, language, auto_title_chats, updated_at)
      values (${userId}, ${next.theme}, ${next.compactMode ? 1 : 0}, ${next.enterToSend ? 1 : 0}, ${next.showTokens ? 1 : 0}, ${next.timezone}, ${next.language}, ${next.autoTitleChats ? 1 : 0}, ${now})
      on duplicate key update theme = values(theme), compact_mode = values(compact_mode), enter_to_send = values(enter_to_send), show_tokens = values(show_tokens), timezone = values(timezone), language = values(language), auto_title_chats = values(auto_title_chats), updated_at = values(updated_at)
    `);
  } else {
    await query(sql`
      insert into user_settings (user_id, theme, compact_mode, enter_to_send, show_tokens, timezone, language, auto_title_chats, updated_at)
      values (${userId}, ${next.theme}, ${next.compactMode ? 1 : 0}, ${next.enterToSend ? 1 : 0}, ${next.showTokens ? 1 : 0}, ${next.timezone}, ${next.language}, ${next.autoTitleChats ? 1 : 0}, ${now})
      on conflict (user_id) do update set theme = excluded.theme, compact_mode = excluded.compact_mode, enter_to_send = excluded.enter_to_send, show_tokens = excluded.show_tokens, timezone = excluded.timezone, language = excluded.language, auto_title_chats = excluded.auto_title_chats, updated_at = excluded.updated_at
    `);
  }
  return next;
}

// --- audit & quota ---
export async function logAudit(input: {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}) {
  const { query } = getDb();
  await query(sql`
    insert into audit_logs (id, actor_user_id, action, target_type, target_id, payload_json, created_at)
    values (${createId("adt")}, ${input.actorUserId}, ${input.action}, ${input.targetType}, ${input.targetId ?? null}, ${JSON.stringify(input.payload ?? {})}, ${nowIso()})
  `);
}

export async function checkAndConsumeMessageQuota(actor: Actor) {
  if (actor.type === "guest") return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  const { query, provider } = getDb();
  const dateKey = nowIso().slice(0, 10);
  const role: Role = actor.roles.includes("admin") ? "admin" : "user";
  const limit = await getRoleLimit(role);
  const rows = await query<Record<string, unknown>>(
    sql`select id, message_count from usage_counters where user_id = ${actor.userId} and date_key = ${dateKey} limit 1`,
  );
  const cur = rows[0] ? asNumber(rows[0].message_count, 0) : 0;
  if (cur >= limit.dailyMessageLimit) return { allowed: false, remaining: 0 };
  const next = cur + 1;
  const now = nowIso();
  if (!rows[0]) {
    if (provider === "mysql") {
      await query(sql`insert ignore into usage_counters (id, user_id, date_key, message_count, token_count, updated_at) values (${createId("usg")}, ${actor.userId}, ${dateKey}, ${next}, ${0}, ${now})`);
    } else {
      await query(sql`insert into usage_counters (id, user_id, date_key, message_count, token_count, updated_at) values (${createId("usg")}, ${actor.userId}, ${dateKey}, ${next}, ${0}, ${now}) on conflict (user_id, date_key) do update set message_count = excluded.message_count, updated_at = excluded.updated_at`);
    }
  } else {
    await query(sql`update usage_counters set message_count = ${next}, updated_at = ${now} where user_id = ${actor.userId} and date_key = ${dateKey}`);
  }
  return { allowed: true, remaining: Math.max(0, limit.dailyMessageLimit - next) };
}

export async function getOwnedFiles(actor: Actor, fileIds: string[]) {
  if (fileIds.length === 0) return [];
  const { query } = getDb();
  const filter = actor.type === "user" ? sql`(owner_user_id = ${actor.userId} or guest_id = ${actor.guestId})` : sql`owner_user_id is null and guest_id = ${actor.guestId}`;
  const rows = await query<Record<string, unknown>>(
    sql`select id, file_name, mime_type, size_bytes, storage_path from files where id in (${sql.join(fileIds.map((id) => sql`${id}`), sql`, `)}) and ${filter}`,
  );
  const byId = new Map(
    rows.map((r) => [
      String(r.id),
      { id: String(r.id), fileName: String(r.file_name), mimeType: String(r.mime_type), sizeBytes: asNumber(r.size_bytes, 0), storagePath: String(r.storage_path) },
    ]),
  );
  return fileIds.map((id) => byId.get(id)).filter(Boolean) as Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; storagePath: string }>;
}

export { hasProjectAccess };
