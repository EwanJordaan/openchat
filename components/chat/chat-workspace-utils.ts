"use client";

import { useEffect, type RefObject } from "react";

import type { ChatMessage, ChatSummary } from "@/lib/types";

export type SessionStatus = "booting" | "ready" | "error";
export type ConversationStatus = "idle" | "loading" | "ready" | "error";

export function isStreamingAssistantMessage(message: ChatMessage) {
  return message.id.startsWith("assistant-stream-");
}

export function isAssistantLoadingMessage(message: ChatMessage) {
  return isStreamingAssistantMessage(message) && message.role === "assistant" && message.content.trim().length === 0;
}

export function isPersistedMessage(messageId: string) {
  return !messageId.startsWith("optimistic-") && !messageId.startsWith("assistant-stream-") && !messageId.startsWith("degraded-");
}

export function getVisibleMessages(messages: ChatMessage[], editingMessageId: string | null) {
  if (!editingMessageId) return messages;
  const targetIndex = messages.findIndex((message) => message.id === editingMessageId);
  if (targetIndex === -1) return messages;
  return messages.slice(0, targetIndex + 1);
}

function toTimestamp(value: string) {
  const date = new Date(value);
  const timestamp = date.valueOf();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sortChatsForSidebar(chats: ChatSummary[]) {
  return [...chats].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    const updatedDelta = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    const createdDelta = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    if (createdDelta !== 0) {
      return createdDelta;
    }

    return a.id.localeCompare(b.id);
  });
}

export function setChatPinnedState(chats: ChatSummary[], chatId: string, isPinned: boolean) {
  let didChange = false;
  const nextChats = chats.map((chat) => {
    if (chat.id !== chatId || chat.isPinned === isPinned) {
      return chat;
    }

    didChange = true;
    return {
      ...chat,
      isPinned,
    };
  });

  return didChange ? nextChats : chats;
}

export type ChatTimeGroup = "today" | "yesterday" | "last7Days" | "last30Days" | "older";

export const CHAT_TIME_GROUP_ORDER: ChatTimeGroup[] = ["today", "yesterday", "last7Days", "last30Days", "older"];

export const CHAT_TIME_GROUP_LABEL: Record<ChatTimeGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7Days: "7 days ago",
  last30Days: "A month ago",
  older: "Older",
};

export function getChatTimeGroup(isoDate: string, now = new Date()): ChatTimeGroup {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.valueOf())) {
    return "older";
  }

  const dayDelta = Math.floor((startOfDay(now).valueOf() - startOfDay(parsed).valueOf()) / (24 * 60 * 60 * 1000));
  if (dayDelta <= 0) return "today";
  if (dayDelta === 1) return "yesterday";
  if (dayDelta <= 7) return "last7Days";
  if (dayDelta <= 30) return "last30Days";
  return "older";
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

export function isConversationStillSelected(input: {
  currentChatId: string | undefined;
  originChatId: string | undefined;
  currentTempChatId: string | null;
  allowedTempChatIds?: readonly string[] | null;
  draftChatId?: string;
}) {
  const allowedTempChatIds = input.allowedTempChatIds ?? null;
  if (allowedTempChatIds && allowedTempChatIds.length > 0) {
    return (
      input.currentChatId === input.originChatId &&
      input.currentTempChatId !== null &&
      allowedTempChatIds.includes(input.currentTempChatId)
    );
  }

  return isSameChatSelection(input.currentChatId, input.originChatId, input.draftChatId);
}

export function shouldResetDraftOnSelectionChange(
  previousChatId: string | undefined,
  nextChatId: string | undefined,
  draftChatId = "draft",
) {
  return getChatSelectionKey(previousChatId, draftChatId) !== getChatSelectionKey(nextChatId, draftChatId);
}

export function isNewChatDraftState(input: {
  activeChatId: string | undefined;
  activeTempChatId: string | null;
  messageCount: number;
}) {
  return !input.activeChatId && !input.activeTempChatId && input.messageCount === 0;
}

export function shouldResetTemporaryModeOnDraftEntry(previousIsNewChatDraft: boolean, nextIsNewChatDraft: boolean) {
  return !previousIsNewChatDraft && nextIsNewChatDraft;
}

export function getMessageActionState(
  message: ChatMessage,
  options: {
    editingMessageId: string | null;
    sending: boolean;
    degraded: boolean;
  },
) {
  const showCopy = !isStreamingAssistantMessage(message);
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
