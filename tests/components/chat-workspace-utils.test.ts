import { describe, expect, it, spyOn } from "bun:test";

import {
  buildChatPath,
  getMessageActionState,
  getChatSelectionKey,
  getVisibleMessages,
  isSameChatSelection,
  isPersistedMessage,
  measureTextareaHeight,
  parseChatIdFromPath,
  shouldSubmitTextareaShortcut,
  syncHistoryPath,
} from "@/components/chat/chat-workspace-utils";
import type { ChatMessage } from "@/lib/types";

const baseMessage: ChatMessage = {
  id: "msg_1",
  chatId: "cht_1",
  role: "user",
  content: "Hello",
  modelId: "gpt-4o-mini",
  createdAt: "2026-03-06T10:00:00.000Z",
  attachments: [],
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

  it("keeps send completion scoped to the origin chat selection", () => {
    expect(isSameChatSelection("cht_b", "cht_a")).toBeFalse();
    expect(isSameChatSelection(undefined, undefined)).toBeTrue();
  });

  it("keeps edit completion scoped to the origin chat selection", () => {
    expect(isSameChatSelection("cht_b", "cht_a")).toBeFalse();
    expect(getChatSelectionKey(undefined)).toBe("draft");
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
});
