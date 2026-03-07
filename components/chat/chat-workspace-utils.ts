"use client";

import { useEffect, type RefObject } from "react";

import type { ChatMessage } from "@/lib/types";

export type SessionStatus = "booting" | "ready" | "error";
export type ConversationStatus = "idle" | "loading" | "ready" | "error";

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

export function parseChatIdFromPath(pathname: string) {
  const match = /^\/chat\/([^/?#]+)/.exec(pathname);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

export function buildChatPath(chatId?: string) {
  if (!chatId) return "/";
  return `/chat/${encodeURIComponent(chatId)}`;
}

export function syncHistoryPath(
  targetPath: string,
  options?: {
    replace?: boolean;
    currentPath?: string;
    historyApi?: Pick<History, "pushState" | "replaceState">;
  },
) {
  const currentPath = options?.currentPath ?? (typeof window === "undefined" ? undefined : window.location.pathname);
  if (!currentPath || currentPath === targetPath) {
    return false;
  }

  const historyApi = options?.historyApi ?? (typeof window === "undefined" ? null : window.history);
  if (!historyApi) {
    return false;
  }

  if (options?.replace) {
    historyApi.replaceState(null, "", targetPath);
  } else {
    historyApi.pushState(null, "", targetPath);
  }
  return true;
}

export function getChatSelectionKey(chatId?: string, draftChatId = "draft") {
  return chatId || draftChatId;
}

export function isSameChatSelection(currentChatId: string | undefined, originChatId: string | undefined, draftChatId = "draft") {
  return getChatSelectionKey(currentChatId, draftChatId) === getChatSelectionKey(originChatId, draftChatId);
}

export function shouldResetDraftOnSelectionChange(
  previousChatId: string | undefined,
  nextChatId: string | undefined,
  draftChatId = "draft",
) {
  return getChatSelectionKey(previousChatId, draftChatId) !== getChatSelectionKey(nextChatId, draftChatId);
}

export function getMessageActionState(
  message: ChatMessage,
  options: {
    editingMessageId: string | null;
    sending: boolean;
    degraded: boolean;
  },
) {
  const showCopy = !message.id.startsWith("assistant-stream-");
  const showEdit = message.role === "user" && isPersistedMessage(message.id) && !options.editingMessageId;
  const disableEdit = options.sending || options.degraded;

  return {
    showCopy,
    showEdit,
    disableEdit,
  };
}

export function getConversationPaneState(input: {
  hasActiveChat: boolean;
  conversationStatus: ConversationStatus;
  messageCount: number;
}) {
  if (input.messageCount > 0) return "messages" as const;
  if (input.hasActiveChat && input.conversationStatus === "loading") return "loading" as const;
  if (input.hasActiveChat && input.conversationStatus === "error") return "error" as const;
  return "empty" as const;
}

export function getComposerAvailability(input: {
  sessionStatus: SessionStatus;
  canChat: boolean;
  sending: boolean;
  uploading: boolean;
  hasDraft: boolean;
  hasActiveChat: boolean;
  conversationStatus: ConversationStatus;
  editingMessage: boolean;
}) {
  const blockedByNetwork = input.sending || input.uploading;
  const sessionReady = input.sessionStatus === "ready";
  const conversationReady = !input.hasActiveChat || input.conversationStatus === "ready";
  const readyForActions = !blockedByNetwork && sessionReady && input.canChat && conversationReady;

  const canType = !blockedByNetwork && (!sessionReady || input.canChat);
  const canSend = readyForActions && input.hasDraft;
  const disableAttachments = !readyForActions || input.editingMessage;

  return {
    canType,
    canSend,
    disableAttachments,
  };
}
