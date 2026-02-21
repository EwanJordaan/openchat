import type { Chat, ChatWithMessages } from "@/backend/domain/chat";

interface ApiResponse<TData> {
  data?: TData;
  error?: {
    code: string;
    message: string;
  };
}

interface CacheEntry<TValue> {
  value: TValue;
  expiresAt: number;
}

interface FetchChatsOptions {
  includeArchived?: boolean;
  query?: string;
  limit?: number;
}

const CHAT_LIST_CACHE_TTL_MS = 30 * 60 * 1000;
const CHAT_DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;
const CHAT_LIST_CACHE_STORAGE_PREFIX = "openchat_chat_list_cache_v1:";

const chatListCache = new Map<string, CacheEntry<Chat[]>>();
const chatListInFlightRequests = new Map<string, Promise<Chat[]>>();

const chatDetailsCache = new Map<string, CacheEntry<ChatWithMessages>>();
const chatDetailsInFlightRequests = new Map<string, Promise<ChatWithMessages>>();

export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export async function fetchChats(userId: string, _signal?: AbortSignal): Promise<Chat[]> {
  const cachedChats = getCachedChatsSnapshot(userId);
  if (cachedChats) {
    return cachedChats;
  }

  const inFlightRequest = chatListInFlightRequests.get(userId);
  if (inFlightRequest) {
    return cloneChats(await inFlightRequest);
  }

  const request = requestChatsFromApi({ includeArchived: true }, _signal);
  chatListInFlightRequests.set(userId, request);

  try {
    const chats = await request;
    setChatListCache(userId, chats);
    return cloneChats(chats);
  } finally {
    const pending = chatListInFlightRequests.get(userId);
    if (pending === request) {
      chatListInFlightRequests.delete(userId);
    }
  }
}

export async function fetchChatById(chatId: string, _signal?: AbortSignal): Promise<ChatWithMessages> {
  void _signal;

  const cachedChat = getCachedChatSnapshot(chatId);
  if (cachedChat) {
    return cachedChat;
  }

  const inFlightRequest = chatDetailsInFlightRequests.get(chatId);
  if (inFlightRequest) {
    return cloneChatWithMessages(await inFlightRequest);
  }

  const request = requestChatByIdFromApi(chatId);
  chatDetailsInFlightRequests.set(chatId, request);

  try {
    const chat = await request;
    storeChatSnapshot(chat);
    return cloneChatWithMessages(chat);
  } finally {
    const pending = chatDetailsInFlightRequests.get(chatId);
    if (pending === request) {
      chatDetailsInFlightRequests.delete(chatId);
    }
  }
}

export async function createChatFromMessage(
  message: string,
  model?: string,
): Promise<ChatWithMessages> {
  const response = await fetch("/api/v1/chats", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to create chat");
  }

  const payload = (await response.json()) as ApiResponse<ChatWithMessages>;
  if (!payload.data) {
    throw new ChatApiError("Create chat response did not include data", 500, "invalid_response");
  }

  storeChatSnapshot(payload.data);
  return cloneChatWithMessages(payload.data);
}

export async function appendChatMessage(
  chatId: string,
  message: string,
  model?: string,
): Promise<ChatWithMessages> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to send message");
  }

  const payload = (await response.json()) as ApiResponse<ChatWithMessages>;
  if (!payload.data) {
    throw new ChatApiError("Append message response did not include data", 500, "invalid_response");
  }

  storeChatSnapshot(payload.data);
  return cloneChatWithMessages(payload.data);
}

export async function updateChatMetadata(
  chatId: string,
  input: { title?: string; isPinned?: boolean; isArchived?: boolean },
): Promise<Chat> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to update chat");
  }

  const payload = (await response.json()) as ApiResponse<Chat>;
  if (!payload.data) {
    throw new ChatApiError("Update chat response did not include data", 500, "invalid_response");
  }

  const normalizedChat = normalizeChat(payload.data);
  updateCachedChat(normalizedChat);
  return { ...normalizedChat };
}

export async function deleteChatMessage(chatId: string, messageId: string): Promise<ChatWithMessages> {
  const response = await fetch(
    `/api/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to delete message");
  }

  const payload = (await response.json()) as ApiResponse<ChatWithMessages>;
  if (!payload.data) {
    throw new ChatApiError("Delete message response did not include data", 500, "invalid_response");
  }

  storeChatSnapshot(payload.data);
  return cloneChatWithMessages(payload.data);
}

export async function requestGuestAssistantResponse(
  message: string,
  model?: string,
): Promise<string> {
  const response = await fetch("/api/v1/chat/guest", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to generate guest response");
  }

  const payload = (await response.json()) as ApiResponse<{
    message?: string;
  }>;
  const assistantMessage = payload.data?.message?.trim();
  if (!assistantMessage) {
    throw new ChatApiError("Guest response did not include an assistant message", 500, "invalid_response");
  }

  return assistantMessage;
}

export async function streamGuestAssistantResponse(
  message: string,
  model: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const response = await fetch("/api/v1/chat/guest/stream", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to generate guest response");
  }

  const donePayload = await consumeChatEventStream<GuestStreamDonePayload>(response, {
    onChunk,
  });

  const assistantMessage = donePayload.message?.trim();
  if (!assistantMessage) {
    throw new ChatApiError("Guest response did not include an assistant message", 500, "invalid_response");
  }

  return assistantMessage;
}

export async function streamCreateChatFromMessage(
  message: string,
  model: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<ChatWithMessages> {
  const response = await fetch("/api/v1/chats/stream", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to create chat");
  }

  const donePayload = await consumeChatEventStream<ChatStreamDonePayload>(response, {
    onChunk,
  });

  if (!donePayload.chat) {
    throw new ChatApiError("Create chat stream did not include chat data", 500, "invalid_response");
  }

  storeChatSnapshot(donePayload.chat);
  return cloneChatWithMessages(donePayload.chat);
}

export async function streamAppendChatMessage(
  chatId: string,
  message: string,
  model: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<ChatWithMessages> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}/messages/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, model }),
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to send message");
  }

  const donePayload = await consumeChatEventStream<ChatStreamDonePayload>(response, {
    onChunk,
  });

  if (!donePayload.chat) {
    throw new ChatApiError("Append stream did not include chat data", 500, "invalid_response");
  }

  storeChatSnapshot(donePayload.chat);
  return cloneChatWithMessages(donePayload.chat);
}

export function getCachedChatsSnapshot(userId: string): Chat[] | undefined {
  const memoryEntry = chatListCache.get(userId);
  if (memoryEntry && isCacheEntryFresh(memoryEntry)) {
    return cloneChats(memoryEntry.value);
  }

  if (memoryEntry && !isCacheEntryFresh(memoryEntry)) {
    chatListCache.delete(userId);
  }

  const persistedEntry = readPersistedChatList(userId);
  if (!persistedEntry) {
    return undefined;
  }

  if (!isCacheEntryFresh(persistedEntry)) {
    clearPersistedChatList(userId);
    return undefined;
  }

  chatListCache.set(userId, {
    value: cloneChats(persistedEntry.value),
    expiresAt: persistedEntry.expiresAt,
  });

  return cloneChats(persistedEntry.value);
}

export function getCachedChatSnapshot(chatId: string): ChatWithMessages | undefined {
  const cached = chatDetailsCache.get(chatId);
  if (!cached) {
    return undefined;
  }

  if (!isCacheEntryFresh(cached)) {
    chatDetailsCache.delete(chatId);
    return undefined;
  }

  return cloneChatWithMessages(cached.value);
}

export function clearChatCache(userId?: string): void {
  if (userId) {
    chatListCache.delete(userId);
    chatListInFlightRequests.delete(userId);
    clearPersistedChatList(userId);
  } else {
    chatListCache.clear();
    chatListInFlightRequests.clear();
    clearAllPersistedChatLists();
  }

  chatDetailsCache.clear();
  chatDetailsInFlightRequests.clear();
}

async function requestChatsFromApi(options?: FetchChatsOptions, signal?: AbortSignal): Promise<Chat[]> {
  const includeArchived = options?.includeArchived;
  const query = options?.query?.trim();
  const limit = options?.limit;
  const searchParams = new URLSearchParams();
  if (includeArchived !== undefined) {
    searchParams.set("includeArchived", includeArchived ? "true" : "false");
  }

  if (query) {
    searchParams.set("q", query);
  }

  if (typeof limit === "number" && Number.isFinite(limit)) {
    searchParams.set("limit", `${Math.floor(limit)}`);
  }

  const path = searchParams.size > 0 ? `/api/v1/chats?${searchParams.toString()}` : "/api/v1/chats";
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to load chats");
  }

  const payload = (await response.json()) as ApiResponse<Chat[]>;
  return Array.isArray(payload.data) ? payload.data.map((chat) => normalizeChat(chat)) : [];
}

async function requestChatByIdFromApi(chatId: string): Promise<ChatWithMessages> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to load chat");
  }

  const payload = (await response.json()) as ApiResponse<ChatWithMessages>;
  if (!payload.data) {
    throw new ChatApiError("Chat response did not include data", 500, "invalid_response");
  }

  return payload.data;
}

function storeChatSnapshot(payload: ChatWithMessages): void {
  const normalizedPayload = normalizeChatWithMessages(payload);

  chatDetailsCache.set(normalizedPayload.chat.id, {
    value: cloneChatWithMessages(normalizedPayload),
    expiresAt: Date.now() + CHAT_DETAILS_CACHE_TTL_MS,
  });

  const userId = normalizedPayload.chat.ownerUserId;
  const existingList = getCachedChatsSnapshot(userId) ?? [];
  const nextList = upsertChat(existingList, normalizedPayload.chat);
  setChatListCache(userId, nextList);
}

function updateCachedChat(chat: Chat): void {
  const normalizedChat = normalizeChat(chat);
  const userId = normalizedChat.ownerUserId;
  const existingList = getCachedChatsSnapshot(userId) ?? [];
  const nextList = upsertChat(existingList, normalizedChat);
  setChatListCache(userId, nextList);

  const existingDetails = chatDetailsCache.get(normalizedChat.id);
  if (!existingDetails || !isCacheEntryFresh(existingDetails)) {
    return;
  }

  chatDetailsCache.set(normalizedChat.id, {
    value: {
      chat: { ...normalizedChat },
      messages: existingDetails.value.messages.map((message) => ({ ...message })),
    },
    expiresAt: existingDetails.expiresAt,
  });
}

function setChatListCache(userId: string, chats: Chat[]): void {
  const entry: CacheEntry<Chat[]> = {
    value: cloneChats(chats),
    expiresAt: Date.now() + CHAT_LIST_CACHE_TTL_MS,
  };

  chatListCache.set(userId, entry);
  writePersistedChatList(userId, entry);
}

function upsertChat(chats: Chat[], updatedChat: Chat): Chat[] {
  const normalizedUpdatedChat = normalizeChat(updatedChat);

  return [normalizedUpdatedChat, ...chats.filter((chat) => chat.id !== normalizedUpdatedChat.id)]
    .map((chat) => normalizeChat(chat))
    .sort(compareChats);
}

function isCacheEntryFresh<TValue>(entry: CacheEntry<TValue>): boolean {
  return entry.expiresAt > Date.now();
}

function cloneChats(chats: Chat[]): Chat[] {
  return chats.map((chat) => normalizeChat(chat));
}

function cloneChatWithMessages(chat: ChatWithMessages): ChatWithMessages {
  const normalized = normalizeChatWithMessages(chat);

  return {
    chat: { ...normalized.chat },
    messages: normalized.messages.map((message) => ({ ...message })),
  };
}

function normalizeChat(chat: Chat): Chat {
  return {
    ...chat,
    isPinned: chat.isPinned ?? false,
    isArchived: chat.isArchived ?? false,
  };
}

function normalizeChatWithMessages(payload: ChatWithMessages): ChatWithMessages {
  return {
    chat: normalizeChat(payload.chat),
    messages: payload.messages.map((message) => ({ ...message })),
  };
}

function compareChats(left: Chat, right: Chat): number {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function hasDom(): boolean {
  return typeof window !== "undefined";
}

function getChatListStorageKey(userId: string): string {
  return `${CHAT_LIST_CACHE_STORAGE_PREFIX}${userId}`;
}

function readPersistedChatList(userId: string): CacheEntry<Chat[]> | null {
  if (!hasDom()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getChatListStorageKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEntry<Chat[]>;
    if (!parsed || typeof parsed.expiresAt !== "number" || !Array.isArray(parsed.value)) {
      return null;
    }

    return {
      value: cloneChats(parsed.value),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writePersistedChatList(userId: string, entry: CacheEntry<Chat[]>): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.setItem(getChatListStorageKey(userId), JSON.stringify(entry));
  } catch {
    // Ignore storage write failures.
  }
}

function clearPersistedChatList(userId: string): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.removeItem(getChatListStorageKey(userId));
  } catch {
    // Ignore storage remove failures.
  }
}

function clearAllPersistedChatLists(): void {
  if (!hasDom()) {
    return;
  }

  const keysToRemove: string[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(CHAT_LIST_CACHE_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage remove failures.
  }
}

async function toChatApiError(response: Response, fallbackMessage: string): Promise<ChatApiError> {
  let payload: ApiResponse<unknown> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<unknown>;
  } catch {
    payload = null;
  }

  const message = payload?.error?.message ?? fallbackMessage;
  const code = payload?.error?.code;

  return new ChatApiError(message, response.status, code);
}

interface GuestStreamDonePayload {
  message?: string;
  model?: string;
}

export async function searchChats(options: FetchChatsOptions, signal?: AbortSignal): Promise<Chat[]> {
  const chats = await requestChatsFromApi(options, signal);
  return cloneChats(chats);
}

interface ChatStreamDonePayload {
  chat?: ChatWithMessages;
}

interface ConsumeEventStreamOptions {
  onChunk: (chunk: string) => void;
}

async function consumeChatEventStream<TDone extends object>(
  response: Response,
  options: ConsumeEventStreamOptions,
): Promise<TDone> {
  if (!response.body) {
    throw new ChatApiError("Streaming response body is missing", 500, "invalid_response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: TDone | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf("\n\n");
        if (boundaryIndex < 0) {
          break;
        }

        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const parsedEvent = parseServerSentEventBlock(block);
        if (!parsedEvent) {
          continue;
        }

        if (parsedEvent.event === "chunk") {
          const chunkText =
            parsedEvent.data && typeof parsedEvent.data === "object" && "text" in parsedEvent.data
              ? parsedEvent.data.text
              : null;

          if (typeof chunkText === "string" && chunkText.length > 0) {
            options.onChunk(chunkText);
          }
          continue;
        }

        if (parsedEvent.event === "error") {
          const errorMessage =
            parsedEvent.data &&
            typeof parsedEvent.data === "object" &&
            "message" in parsedEvent.data &&
            typeof parsedEvent.data.message === "string"
              ? parsedEvent.data.message
              : "Streaming request failed";

          throw new ChatApiError(errorMessage, response.status || 500, "stream_error");
        }

        if (parsedEvent.event === "done" && parsedEvent.data && typeof parsedEvent.data === "object") {
          donePayload = parsedEvent.data as TDone;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!donePayload) {
    throw new ChatApiError("Streaming response ended before completion", response.status || 500, "stream_incomplete");
  }

  return donePayload;
}

interface ParsedServerSentEvent {
  event: string;
  data: unknown;
}

function parseServerSentEventBlock(block: string): ParsedServerSentEvent | null {
  const lines = block.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");
  let parsedData: unknown = rawData;
  try {
    parsedData = JSON.parse(rawData);
  } catch {
    parsedData = rawData;
  }

  return {
    event: eventName,
    data: parsedData,
  };
}
