import type { Chat, ChatWithMessages } from "@/backend/domain/chat";
import type { ModelProviderId } from "@/shared/model-providers";

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

  const request = requestChatsFromApi(_signal);
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
  modelProvider: ModelProviderId,
): Promise<ChatWithMessages> {
  const response = await fetch("/api/v1/chats", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, modelProvider }),
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
  modelProvider: ModelProviderId,
): Promise<ChatWithMessages> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, modelProvider }),
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

async function requestChatsFromApi(signal?: AbortSignal): Promise<Chat[]> {
  const response = await fetch("/api/v1/chats", {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await toChatApiError(response, "Failed to load chats");
  }

  const payload = (await response.json()) as ApiResponse<Chat[]>;
  return Array.isArray(payload.data) ? payload.data : [];
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
  chatDetailsCache.set(payload.chat.id, {
    value: cloneChatWithMessages(payload),
    expiresAt: Date.now() + CHAT_DETAILS_CACHE_TTL_MS,
  });

  const userId = payload.chat.ownerUserId;
  const existingList = getCachedChatsSnapshot(userId) ?? [];
  const nextList = upsertChat(existingList, payload.chat);
  setChatListCache(userId, nextList);
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
  return [updatedChat, ...chats.filter((chat) => chat.id !== updatedChat.id)].sort((a, b) => {
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function isCacheEntryFresh<TValue>(entry: CacheEntry<TValue>): boolean {
  return entry.expiresAt > Date.now();
}

function cloneChats(chats: Chat[]): Chat[] {
  return chats.map((chat) => ({ ...chat }));
}

function cloneChatWithMessages(chat: ChatWithMessages): ChatWithMessages {
  return {
    chat: { ...chat.chat },
    messages: chat.messages.map((message) => ({ ...message })),
  };
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
