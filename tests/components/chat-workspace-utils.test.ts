import { describe, expect, it } from "bun:test";

import {
  getMessageActionState,
  getVisibleMessages,
  isPersistedMessage,
  measureTextareaHeight,
  shouldSubmitTextareaShortcut,
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

  it("shows copy for all messages and edit for persisted user messages", () => {
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
