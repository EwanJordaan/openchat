import type { ChatSummary } from "@/lib/types";

const TTL_MS = 45_000;

type Entry = { chats: ChatSummary[]; expiresAt: number };
const cache = new Map<string, Entry>();

function key(type: "guest" | "user", id: string) {
  return `${type}:${id}`;
}

export function getCachedChatList(type: "guest" | "user", id: string): ChatSummary[] | null {
  const e = cache.get(key(type, id));
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key(type, id));
    return null;
  }
  return e.chats;
}

export function setCachedChatList(type: "guest" | "user", id: string, chats: ChatSummary[]) {
  cache.set(key(type, id), { chats, expiresAt: Date.now() + TTL_MS });
}

export function invalidateChatListCache(type: "guest" | "user", id: string) {
  cache.delete(key(type, id));
}

export function invalidateAllChatCache() {
  cache.clear();
}
