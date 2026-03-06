"use client";

import { useEffect, type RefObject } from "react";

import type { ChatMessage } from "@/lib/types";

export function isPersistedMessage(messageId: string) {
  return !messageId.startsWith("optimistic-") && !messageId.startsWith("assistant-stream-") && !messageId.startsWith("degraded-");
}

export function getVisibleMessages(messages: ChatMessage[], editingMessageId: string | null) {
  if (!editingMessageId) return messages;
  const targetIndex = messages.findIndex((message) => message.id === editingMessageId);
  if (targetIndex === -1) return messages;
  return messages.slice(0, targetIndex + 1);
}

export function measureTextareaHeight(scrollHeight: number, maxHeight: number, minHeight = 44) {
  const nextHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
  return {
    height: `${nextHeight}px`,
    overflowY: (scrollHeight > maxHeight ? "auto" : "hidden") as "auto" | "hidden",
  };
}

export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options?: {
    maxHeight?: number;
    minHeight?: number;
  },
) {
  const maxHeight = options?.maxHeight ?? 140;
  const minHeight = options?.minHeight ?? 44;

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const { height, overflowY } = measureTextareaHeight(textarea.scrollHeight, maxHeight, minHeight);
    textarea.style.height = height;
    textarea.style.overflowY = overflowY;
  }, [maxHeight, minHeight, ref, value]);
}

export function shouldSubmitTextareaShortcut(input: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
}

export function getMessageActionState(
  message: ChatMessage,
  options: {
    editingMessageId: string | null;
    sending: boolean;
    degraded: boolean;
  },
) {
  const showCopy = true;
  const showEdit = message.role === "user" && isPersistedMessage(message.id) && !options.editingMessageId;
  const disableEdit = options.sending || options.degraded;

  return {
    showCopy,
    showEdit,
    disableEdit,
  };
}
