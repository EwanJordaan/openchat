import { afterEach, describe, expect, it } from "bun:test";

import {
  getCachedChatList,
  invalidateChatListCache,
  setCachedChatList,
} from "@/lib/cache/chat-cache";
import type { ChatSummary } from "@/lib/types";

const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
  invalidateChatListCache("guest", "g-1");
  invalidateChatListCache("user", "u-1");
});

describe("lib/cache/chat-cache", () => {
  it("returns a cached chat list before expiration", () => {
    Date.now = () => 1_000;
    const chats: ChatSummary[] = [
      { id: "c1", title: "One", modelId: "gpt-4o-mini", createdAt: "a", updatedAt: "b" },
    ];

    setCachedChatList("guest", "g-1", chats);
    expect(getCachedChatList("guest", "g-1")).toEqual(chats);
  });

  it("expires cached chat list after ttl", () => {
    Date.now = () => 1_000;
    setCachedChatList("user", "u-1", []);

    Date.now = () => 47_000;
    expect(getCachedChatList("user", "u-1")).toBeNull();
  });

  it("invalidates by actor key", () => {
    setCachedChatList("guest", "g-1", []);
    expect(getCachedChatList("guest", "g-1")).toEqual([]);

    invalidateChatListCache("guest", "g-1");
    expect(getCachedChatList("guest", "g-1")).toBeNull();
  });
});
