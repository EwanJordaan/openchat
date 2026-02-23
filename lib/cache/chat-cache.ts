import type { ChatSummary } from "@/lib/types";

const CHAT_CACHE_TTL_MS = 45_000;

interface CacheEntry {
  chats: ChatSummary[];
  expiresAt: number;
}

const chatListCache = new Map<string, CacheEntry>();

function cacheKey(actorType: "guest" | "user", id: string) {
  return `${actorType}:${id}`;
}

export function getCachedChatList(actorType: "guest" | "user", id: string) {
  const key = cacheKey(actorType, id);
  const entry = chatListCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    chatListCache.delete(key);
    return null;
  }
  return entry.chats;
}

export function setCachedChatList(actorType: "guest" | "user", id: string, chats: ChatSummary[]) {
  const key = cacheKey(actorType, id);
  chatListCache.set(key, {
    chats,
    expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
  });
}

export function invalidateChatListCache(actorType: "guest" | "user", id: string) {
  chatListCache.delete(cacheKey(actorType, id));
}
