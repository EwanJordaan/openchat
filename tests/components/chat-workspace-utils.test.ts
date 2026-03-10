import { describe, expect, it, spyOn } from "bun:test";

import {
  buildChatPath,
  getComposerAvailability,
  getConversationPaneState,
  getChatTimeGroup,
  getMessageActionState,
  isConversationStillSelected,
  getChatSelectionKey,
  getVisibleMessages,
  isSameChatSelection,
  isPersistedMessage,
  measureTextareaHeight,
  parseChatIdFromPath,
  setChatPinnedState,
  sortChatsForSidebar,
  shouldResetDraftOnSelectionChange,
  shouldSubmitTextareaShortcut,
  syncHistoryPath,
} from "@/components/chat/chat-workspace-utils";
import type { ChatMessage, ChatSummary } from "@/lib/types";

const baseMessage: ChatMessage = {
  id: "msg_1",
  chatId: "cht_1",
  role: "user",
  content: "Hello",
  modelId: "gpt-4o-mini",
  createdAt: "2026-03-06T10:00:00.000Z",
  attachments: [],
};

const baseChatSummary: ChatSummary = {
  id: "cht_1",
  title: "Chat",
  modelId: "gpt-4o-mini",
  isPinned: false,
  createdAt: "2026-03-06T10:00:00.000Z",
  updatedAt: "2026-03-06T10:00:00.000Z",
};

describe("chat workspace helpers", () => {
  it("measures textarea height within bounds", () => {
    expect(measureTextareaHeight(20, 140)).toEqual({
      height: "44px",
      overflowY: "hidden",
    });
    expect(measureTextareaHeight(180, 140)).toEqual({
      height: "140px",
      overflowY: "auto",
    });
  });

  it("detects enter-to-submit shortcuts", () => {
    expect(shouldSubmitTextareaShortcut({ key: "Enter", shiftKey: false, isComposing: false })).toBeTrue();
    expect(shouldSubmitTextareaShortcut({ key: "Enter", shiftKey: true, isComposing: false })).toBeFalse();
    expect(shouldSubmitTextareaShortcut({ key: "a", shiftKey: false, isComposing: false })).toBeFalse();
  });

  it("parses chat ids from paths", () => {
    expect(parseChatIdFromPath("/")).toBeUndefined();
    expect(parseChatIdFromPath("/chat/cht_123")).toBe("cht_123");
    expect(parseChatIdFromPath("/settings")).toBeUndefined();
  });

  it("builds chat paths from chat ids", () => {
    expect(buildChatPath()).toBe("/");
    expect(buildChatPath("cht_123")).toBe("/chat/cht_123");
  });

  it("skips history writes when target path already matches current path", () => {
    const historyApi = {
      pushState: () => undefined,
      replaceState: () => undefined,
    };
    const pushStateSpy = spyOn(historyApi, "pushState");

    const changed = syncHistoryPath("/chat/cht_123", {
      currentPath: "/chat/cht_123",
      historyApi,
    });

    expect(changed).toBeFalse();
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("applies only the currently selected chat after rapid switch A to B", () => {
    expect(isSameChatSelection("cht_b", "cht_a")).toBeFalse();
    expect(isSameChatSelection("cht_b", "cht_b")).toBeTrue();
  });

  it("treats provisional and resolved temp ids as the same active conversation", () => {
    const allowedTempChatIds = ["tmp-local-1", "tch_1"];

    expect(
      isConversationStillSelected({
        currentChatId: undefined,
        originChatId: undefined,
        currentTempChatId: "tmp-local-1",
        allowedTempChatIds,
      }),
    ).toBeTrue();

    expect(
      isConversationStillSelected({
        currentChatId: undefined,
        originChatId: undefined,
        currentTempChatId: "tch_1",
        allowedTempChatIds,
      }),
    ).toBeTrue();
  });

  it("rejects unrelated temp ids while temp tracking is active", () => {
    expect(
      isConversationStillSelected({
        currentChatId: undefined,
        originChatId: undefined,
        currentTempChatId: "tch_other",
        allowedTempChatIds: ["tmp-local-1", "tch_1"],
      }),
    ).toBeFalse();
  });

  it("falls back to chat/draft selection checks when temp tracking is absent", () => {
    expect(
      isConversationStillSelected({
        currentChatId: undefined,
        originChatId: undefined,
        currentTempChatId: null,
      }),
    ).toBeTrue();

    expect(
      isConversationStillSelected({
        currentChatId: "cht_b",
        originChatId: "cht_a",
        currentTempChatId: null,
      }),
    ).toBeFalse();
  });

  it("keeps send completion scoped to the origin chat selection", () => {
    expect(isSameChatSelection("cht_b", "cht_a")).toBeFalse();
    expect(isSameChatSelection(undefined, undefined)).toBeTrue();
  });

  it("keeps edit completion scoped to the origin chat selection", () => {
    expect(isSameChatSelection("cht_b", "cht_a")).toBeFalse();
    expect(getChatSelectionKey(undefined)).toBe("draft");
  });

  it("does not reset draft when session hydration keeps same draft selection", () => {
    expect(shouldResetDraftOnSelectionChange(undefined, undefined)).toBeFalse();
  });

  it("resets draft when switching between draft and persisted chats", () => {
    expect(shouldResetDraftOnSelectionChange(undefined, "cht_a")).toBeTrue();
    expect(shouldResetDraftOnSelectionChange("cht_a", undefined)).toBeTrue();
    expect(shouldResetDraftOnSelectionChange("cht_a", "cht_b")).toBeTrue();
  });

  it("maps back and forward paths to the selected chat id", () => {
    const backTarget = parseChatIdFromPath("/chat/cht_a");
    const forwardTarget = parseChatIdFromPath("/chat/cht_b");
    expect(isSameChatSelection(backTarget, "cht_a")).toBeTrue();
    expect(isSameChatSelection(forwardTarget, "cht_b")).toBeTrue();
  });

  it("distinguishes persisted messages from optimistic placeholders", () => {
    expect(isPersistedMessage("msg_1")).toBeTrue();
    expect(isPersistedMessage("optimistic-1")).toBeFalse();
    expect(isPersistedMessage("assistant-stream-1")).toBeFalse();
  });

  it("hides later messages while an earlier message is being edited", () => {
    const laterMessage: ChatMessage = {
      ...baseMessage,
      id: "msg_2",
      role: "assistant",
      content: "Later reply",
    };

    expect(getVisibleMessages([baseMessage, laterMessage], "msg_1")).toEqual([baseMessage]);
    expect(getVisibleMessages([baseMessage, laterMessage], null)).toEqual([baseMessage, laterMessage]);
  });

  it("shows copy for non-streamed messages and edit for persisted user messages", () => {
    expect(
      getMessageActionState(baseMessage, {
        editingMessageId: null,
        sending: false,
        degraded: false,
      }),
    ).toEqual({
      showCopy: true,
      showEdit: true,
      disableEdit: false,
    });

    expect(
      getMessageActionState(
        {
          ...baseMessage,
          role: "assistant",
        },
        {
          editingMessageId: null,
          sending: false,
          degraded: false,
        },
      ),
    ).toEqual({
      showCopy: true,
      showEdit: false,
      disableEdit: false,
    });

    expect(
      getMessageActionState(
        {
          ...baseMessage,
          id: "assistant-stream-1",
          role: "assistant",
        },
        {
          editingMessageId: null,
          sending: true,
          degraded: false,
        },
      ),
    ).toEqual({
      showCopy: false,
      showEdit: false,
      disableEdit: true,
    });

    expect(
      getMessageActionState(baseMessage, {
        editingMessageId: "msg_2",
        sending: true,
        degraded: false,
      }),
    ).toEqual({
      showCopy: true,
      showEdit: false,
      disableEdit: true,
    });
  });

  it("sorts chats with pinned first, then latest activity", () => {
    const chats: ChatSummary[] = [
      {
        ...baseChatSummary,
        id: "cht_unpinned_new",
        isPinned: false,
        updatedAt: "2026-03-06T12:00:00.000Z",
      },
      {
        ...baseChatSummary,
        id: "cht_pinned_old",
        isPinned: true,
        updatedAt: "2026-03-06T09:00:00.000Z",
      },
      {
        ...baseChatSummary,
        id: "cht_pinned_new",
        isPinned: true,
        updatedAt: "2026-03-06T13:00:00.000Z",
      },
    ];

    expect(sortChatsForSidebar(chats).map((chat) => chat.id)).toEqual([
      "cht_pinned_new",
      "cht_pinned_old",
      "cht_unpinned_new",
    ]);
  });

  it("updates only the target chat pin state", () => {
    const chats: ChatSummary[] = [
      { ...baseChatSummary, id: "cht_1", isPinned: false },
      { ...baseChatSummary, id: "cht_2", isPinned: true },
    ];

    const updated = setChatPinnedState(chats, "cht_1", true);
    expect(updated).toEqual([
      { ...baseChatSummary, id: "cht_1", isPinned: true },
      { ...baseChatSummary, id: "cht_2", isPinned: true },
    ]);
    expect(updated[1]).toBe(chats[1]);
  });

  it("returns the same array when chat id is missing", () => {
    const chats: ChatSummary[] = [{ ...baseChatSummary, id: "cht_1", isPinned: false }];
    const updated = setChatPinnedState(chats, "missing", true);
    expect(updated).toBe(chats);
  });

  it("returns the same array when pin state is unchanged", () => {
    const chats: ChatSummary[] = [{ ...baseChatSummary, id: "cht_1", isPinned: true }];
    const updated = setChatPinnedState(chats, "cht_1", true);
    expect(updated).toBe(chats);
  });

  it("uses createdAt then id as stable tie-breakers", () => {
    const chats: ChatSummary[] = [
      {
        ...baseChatSummary,
        id: "cht_b",
        isPinned: false,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
      },
      {
        ...baseChatSummary,
        id: "cht_a",
        isPinned: false,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
      },
      {
        ...baseChatSummary,
        id: "cht_newer_created",
        isPinned: false,
        createdAt: "2026-03-06T11:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z",
      },
    ];

    expect(sortChatsForSidebar(chats).map((chat) => chat.id)).toEqual([
      "cht_newer_created",
      "cht_a",
      "cht_b",
    ]);
  });

  it("handles invalid timestamps without crashing and keeps deterministic order", () => {
    const chats: ChatSummary[] = [
      {
        ...baseChatSummary,
        id: "cht_invalid_a",
        isPinned: false,
        createdAt: "not-a-date",
        updatedAt: "also-invalid",
      },
      {
        ...baseChatSummary,
        id: "cht_invalid_b",
        isPinned: false,
        createdAt: "still-not-a-date",
        updatedAt: "invalid-too",
      },
    ];

    expect(sortChatsForSidebar(chats).map((chat) => chat.id)).toEqual([
      "cht_invalid_a",
      "cht_invalid_b",
    ]);
  });

  it("groups chat timestamps into today/yesterday/7 days/month/older labels", () => {
    const now = new Date("2026-03-09T10:00:00.000Z");
    expect(getChatTimeGroup("2026-03-09T08:00:00.000Z", now)).toBe("today");
    expect(getChatTimeGroup("2026-03-08T08:00:00.000Z", now)).toBe("yesterday");
    expect(getChatTimeGroup("2026-03-05T08:00:00.000Z", now)).toBe("last7Days");
    expect(getChatTimeGroup("2026-02-20T08:00:00.000Z", now)).toBe("last30Days");
    expect(getChatTimeGroup("2026-01-01T08:00:00.000Z", now)).toBe("older");
    expect(getChatTimeGroup("not-a-date", now)).toBe("older");
  });

  it("derives loading, error, and empty conversation pane states", () => {
    expect(
      getConversationPaneState({
        hasActiveChat: true,
        conversationStatus: "loading",
        messageCount: 0,
      }),
    ).toBe("loading");

    expect(
      getConversationPaneState({
        hasActiveChat: true,
        conversationStatus: "error",
        messageCount: 0,
      }),
    ).toBe("error");

    expect(
      getConversationPaneState({
        hasActiveChat: false,
        conversationStatus: "idle",
        messageCount: 0,
      }),
    ).toBe("empty");
  });

  it("keeps showing messages while conversation refresh is loading", () => {
    expect(
      getConversationPaneState({
        hasActiveChat: true,
        conversationStatus: "loading",
        messageCount: 2,
      }),
    ).toBe("messages");
  });

  it("allows typing but disables send while hydrating an existing chat", () => {
    expect(
      getComposerAvailability({
        sessionStatus: "ready",
        canChat: true,
        sending: false,
        uploading: false,
        hasDraft: true,
        hasActiveChat: true,
        conversationStatus: "loading",
        editingMessage: false,
      }),
    ).toEqual({
      canType: true,
      canSend: false,
      disableAttachments: true,
    });
  });

  it("keeps send disabled until session is ready on cold boot", () => {
    expect(
      getComposerAvailability({
        sessionStatus: "booting",
        canChat: false,
        sending: false,
        uploading: false,
        hasDraft: true,
        hasActiveChat: false,
        conversationStatus: "idle",
        editingMessage: false,
      }),
    ).toEqual({
      canType: true,
      canSend: false,
      disableAttachments: true,
    });
  });

  it("allows send when session and conversation are ready", () => {
    expect(
      getComposerAvailability({
        sessionStatus: "ready",
        canChat: true,
        sending: false,
        uploading: false,
        hasDraft: true,
        hasActiveChat: true,
        conversationStatus: "ready",
        editingMessage: false,
      }),
    ).toEqual({
      canType: true,
      canSend: true,
      disableAttachments: false,
    });
  });

  it("keeps attachments enabled when ready even without a draft", () => {
    expect(
      getComposerAvailability({
        sessionStatus: "ready",
        canChat: true,
        sending: false,
        uploading: false,
        hasDraft: false,
        hasActiveChat: false,
        conversationStatus: "idle",
        editingMessage: false,
      }),
    ).toEqual({
      canType: true,
      canSend: false,
      disableAttachments: false,
    });
  });
});
