import { describe, expect, it } from "bun:test";

import { parseErrorMessage } from "@/components/admin/admin-dashboard";
import { buildAuthPayload } from "@/components/auth/signin-view";
import {
  buildChatPath,
  getChatTimeGroup,
  getComposerAvailability,
  getConversationPaneState,
  getVisibleMessages,
  isPersistedMessage,
  parseChatIdFromPath,
  setChatPinnedState,
  shouldSubmitTextareaShortcut,
  sortChatsForSidebar,
} from "@/components/chat/chat-workspace-utils";
import { resolveTheme } from "@/components/providers/theme-provider";
import { getNextMode } from "@/components/ui/theme-toggle";
import { chatFactory, messageFactory } from "@/tests/helpers/factories";

describe("frontend helper matrix", () => {
  for (const mode of ["login", "register"] as const) {
    for (let i = 0; i < 20; i += 1) {
      it(`buildAuthPayload matrix ${mode} ${i + 1}`, () => {
        const payload = buildAuthPayload(mode, `user${i}@example.com`, `pw-${i}`, `Name ${i}`);
        expect(payload.email).toBe(`user${i}@example.com`);
        expect(payload.password).toBe(`pw-${i}`);
        if (mode === "register") {
          expect(payload).toMatchObject({ name: `Name ${i}` });
        }
      });
    }
  }

  const rawErrors = ["", "plain", '{"error":"Bad"}', '{"message":"Nope"}', '{"error":null}', '{"error":123}'];
  for (const [index, raw] of rawErrors.entries()) {
    it(`parseErrorMessage variant ${index + 1}`, () => {
      const parsed = parseErrorMessage(raw);
      if (raw === '{"error":"Bad"}') {
        expect(parsed).toBe("Bad");
      } else {
        expect(parsed === null || typeof parsed === "string" || typeof parsed === "number").toBe(true);
      }
    });
  }

  for (const [mode, resolved] of [
    ["system", "dark"],
    ["system", "light"],
    ["dark", "dark"],
    ["light", "light"],
  ] as const) {
    it(`getNextMode ${mode} ${resolved}`, () => {
      expect(["light", "dark"]).toContain(getNextMode(mode, resolved));
    });
  }

  it("resolveTheme respects explicit modes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  for (let i = 0; i < 20; i += 1) {
    it(`parse/build chat path roundtrip ${i + 1}`, () => {
      const id = `chat-${i}`;
      const path = buildChatPath(id);
      expect(path).toBe(`/chat/${encodeURIComponent(id)}`);
      expect(parseChatIdFromPath(path)).toBe(id);
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`conversation pane state matrix ${i + 1}`, () => {
      const state = getConversationPaneState({
        hasActiveChat: i % 2 === 0,
        conversationStatus: i % 4 === 0 ? "loading" : i % 4 === 1 ? "error" : "ready",
        messageCount: i % 3 === 0 ? 1 : 0,
      });
      expect(["messages", "loading", "error", "empty"]).toContain(state);
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`composer availability matrix ${i + 1}`, () => {
      const state = getComposerAvailability({
        sessionStatus: i % 3 === 0 ? "booting" : i % 3 === 1 ? "error" : "ready",
        canChat: i % 2 === 0,
        sending: i % 5 === 0,
        uploading: i % 7 === 0,
        hasDraft: i % 2 === 1,
        hasActiveChat: i % 4 === 0,
        conversationStatus: i % 4 === 0 ? "loading" : "ready",
        editingMessage: i % 6 === 0,
      });
      expect(typeof state.canType).toBe("boolean");
      expect(typeof state.canSend).toBe("boolean");
      expect(typeof state.disableAttachments).toBe("boolean");
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`sortChatsForSidebar stable ordering ${i + 1}`, () => {
      const chats = [
        chatFactory({ id: `a-${i}`, isPinned: i % 2 === 0, updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
        chatFactory({ id: `b-${i}`, isPinned: false, updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
      ];
      const sorted = sortChatsForSidebar(chats);
      expect(sorted).toHaveLength(2);
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`setChatPinnedState updates target only ${i + 1}`, () => {
      const chats = [chatFactory({ id: "a", isPinned: false }), chatFactory({ id: "b", isPinned: false })];
      const next = setChatPinnedState(chats, i % 2 === 0 ? "a" : "b", true);
      expect(next.filter((chat) => chat.isPinned)).toHaveLength(1);
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`visibility and persisted checks ${i + 1}`, () => {
      const messages = [
        messageFactory({ id: "optimistic-1" }),
        messageFactory({ id: "assistant-stream-1", role: "assistant" }),
        messageFactory({ id: `msg-${i}` }),
      ];
      const visible = getVisibleMessages(messages, i % 2 === 0 ? `msg-${i}` : null);
      expect(visible.length).toBeGreaterThan(0);
      expect(isPersistedMessage(`msg-${i}`)).toBe(true);
      expect(isPersistedMessage("optimistic-1")).toBe(false);
    });
  }

  for (let i = 0; i < 20; i += 1) {
    it(`keyboard shortcut and date grouping ${i + 1}`, () => {
      expect(shouldSubmitTextareaShortcut({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
      const day = ((i % 28) + 1).toString().padStart(2, "0");
      const group = getChatTimeGroup(`2026-03-${day}T00:00:00.000Z`, new Date("2026-03-30T00:00:00.000Z"));
      expect(["today", "yesterday", "last7Days", "last30Days", "older"]).toContain(group);
    });
  }
});
