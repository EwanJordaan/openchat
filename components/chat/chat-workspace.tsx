"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  FileText,
  LoaderCircle,
  LogOut,
  Paperclip,
  Search,
  SendHorizontal,
  Settings,
  Shield,
  Square,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  buildChatPath,
  getComposerAvailability,
  getConversationPaneState,
  getMessageActionState,
  getVisibleMessages,
  isSameChatSelection,
  parseChatIdFromPath,
  shouldResetDraftOnSelectionChange,
  type ConversationStatus,
  type SessionStatus,
  syncHistoryPath,
  useAutosizeTextarea,
  shouldSubmitTextareaShortcut,
} from "@/components/chat/chat-workspace-utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/providers/theme-provider";
import type { Actor, ChatMessage, ChatSummary, ModelOption, PublicAppSettings, UploadedFile } from "@/lib/types";

interface EditSession {
  messageId: string;
  originalMessages: ChatMessage[];
  savedDraft: string;
  savedPendingFiles: File[];
}

const CHAT_CACHE_KEY = "openchat:chat-list";
const CHAT_MESSAGES_CACHE_KEY = "openchat:chat-messages";
const SESSION_CACHE_KEY = "openchat:session";
const DRAFT_CHAT_ID = "draft";

let sessionMemoryCache: SessionPayload | null = null;

function safeParseJson<T>(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return !!target.closest("input, textarea, select, [contenteditable='true']");
}

function getInitialSessionSnapshot() {
  if (sessionMemoryCache) return sessionMemoryCache;
  if (typeof window === "undefined") return null;
  const cached = safeParseJson<SessionPayload>(localStorage.getItem(SESSION_CACHE_KEY));
  if (!cached) return null;
  sessionMemoryCache = cached;
  return cached;
}

function cacheSessionSnapshot(nextSession: SessionPayload) {
  sessionMemoryCache = nextSession;
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(nextSession));
}

function clearSessionSnapshot() {
  sessionMemoryCache = null;
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_CACHE_KEY);
}

function chatListCacheKey(actor: Actor) {
  return `${CHAT_CACHE_KEY}:${actorCacheKey(actor)}`;
}

function chatMessagesCacheKey(actor: Actor, chatId: string) {
  return `${CHAT_MESSAGES_CACHE_KEY}:${actorCacheKey(actor)}:${chatId}`;
}

function readCachedChats(actor: Actor) {
  if (typeof window === "undefined") return [] as ChatSummary[];
  const cached = safeParseJson<ChatSummary[]>(localStorage.getItem(chatListCacheKey(actor)));
  return cached || [];
}

function writeCachedChats(actor: Actor, chats: ChatSummary[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(chatListCacheKey(actor), JSON.stringify(chats));
}

function readCachedChatMessages(actor: Actor, chatId: string) {
  if (typeof window === "undefined") return [] as ChatMessage[];
  const cached = safeParseJson<ChatMessage[]>(localStorage.getItem(chatMessagesCacheKey(actor, chatId)));
  return cached || [];
}

function writeCachedChatMessages(actor: Actor, chatId: string, nextMessages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(chatMessagesCacheKey(actor, chatId), JSON.stringify(nextMessages));
}

function removeCachedChatMessages(actor: Actor, chatId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(chatMessagesCacheKey(actor, chatId));
}

interface SessionPayload {
  actor: Actor;
  settings: PublicAppSettings;
  models: ModelOption[];
  degraded?: boolean;
  error?: string;
}

function actorCacheKey(actor: Actor | null) {
  if (!actor) return "anonymous";
  return actor.type === "user" ? `user:${actor.userId}` : `guest:${actor.guestId}`;
}

function useAutoScroll(dep: unknown) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dep]);
  return anchorRef;
}

function useDismissibleMenu({
  enabled,
  containerRef,
  onDismiss,
}: {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        onDismiss();
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [containerRef, enabled, onDismiss]);
}

function ModelSelector({
  models,
  modelId,
  onSelect,
}: {
  models: ModelOption[];
  modelId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const current = models.find((model) => model.id === modelId) || models[0];
  const groupedModels = useMemo(() => {
    const buckets: Record<"Fast" | "Balanced" | "Deep Reasoning", ModelOption[]> = {
      Fast: [],
      Balanced: [],
      "Deep Reasoning": [],
    };

    for (const model of models) {
      const text = `${model.id} ${model.displayName}`.toLowerCase();
      if (/(mini|haiku|flash|turbo|lite|fast)/.test(text)) {
        buckets.Fast.push(model);
        continue;
      }
      if (/(thinking|reason|o1|o3|opus|pro|r1|deep)/.test(text)) {
        buckets["Deep Reasoning"].push(model);
        continue;
      }
      buckets.Balanced.push(model);
    }

    return [
      { label: "Fast", items: buckets.Fast },
      { label: "Balanced", items: buckets.Balanced },
      { label: "Deep Reasoning", items: buckets["Deep Reasoning"] },
    ].filter((group) => group.items.length > 0);
  }, [models]);

  useDismissibleMenu({
    enabled: open,
    containerRef: selectorRef,
    onDismiss: () => setOpen(false),
  });

  return (
    <div className={`model-selector ${open ? "open" : ""}`} ref={selectorRef}>
      <button
        type="button"
        className="model-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="model-trigger-label">{current?.displayName ?? "Select model"}</span>
        <ChevronDown size={14} className="model-trigger-caret" />
      </button>

      {open ? (
        <div className="model-drawer" role="menu">
          {groupedModels.map((group) => (
            <section className="model-group" key={group.label}>
              <p className="model-group-label">{group.label}</p>
              <div className="model-group-list">
                {group.items.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`model-option ${model.id === modelId ? "active" : ""}`}
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                  >
                    <p className="model-option-label">{model.displayName}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatWorkspace({ initialChatId }: { initialChatId?: string }) {
  const { setMode } = useTheme();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("booting");
  const [chatListStatus, setChatListStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [conversationStatus, setConversationStatus] = useState<ConversationStatus>(initialChatId ? "loading" : "idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(initialChatId);

  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState("gpt-4o-mini");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAttachMenuOpen, setAttachMenuOpen] = useState(false);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messageAnchor = useAutoScroll(messages.length);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) || null, [chats, activeChatId]);
  const chatLayoutRef = useRef<HTMLDivElement | null>(null);
  const chatHeaderRef = useRef<HTMLElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const composerWrapRef = useRef<HTMLElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageStreamRef = useRef<HTMLElement | null>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const loadChatAbortControllerRef = useRef<AbortController | null>(null);
  const loadChatRequestIdRef = useRef(0);
  const activeChatIdRef = useRef<string | undefined>(initialChatId);
  const lastDraftResetChatIdRef = useRef<string | undefined>(initialChatId);
  const copiedMessageTimeoutRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [isMacPlatform, setIsMacPlatform] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const closeAttachMenu = useCallback(() => setAttachMenuOpen(false), []);
  const closeProfileMenu = useCallback(() => setProfileMenuOpen(false), []);
  const closeChatMenu = useCallback(() => setOpenChatMenuId(null), []);
  const syncChatPath = useCallback((chatId?: string, options?: { replace?: boolean }) => {
    syncHistoryPath(buildChatPath(chatId), { replace: options?.replace });
  }, []);
  const isChatStillSelected = useCallback(
    (originChatId?: string) => isSameChatSelection(activeChatIdRef.current, originChatId, DRAFT_CHAT_ID),
    [],
  );

  useEffect(() => {
    const cachedSession = getInitialSessionSnapshot();
    if (!cachedSession) {
      if (activeChatIdRef.current) {
        setConversationStatus("loading");
      }
      return;
    }

    setSession(cachedSession);
    setSessionStatus("ready");
    setModelId(cachedSession.settings.defaultModelId || "gpt-4o-mini");

    const cachedChats = readCachedChats(cachedSession.actor);
    setChats(cachedChats);
    setChatListStatus(cachedChats.length ? "ready" : "idle");

    const cachedMessages = readCachedChatMessages(cachedSession.actor, activeChatIdRef.current || DRAFT_CHAT_ID);
    setMessages(cachedMessages);
    setConversationStatus(activeChatIdRef.current ? "loading" : "idle");
  }, []);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    const onPopState = () => {
      const nextChatId = parseChatIdFromPath(window.location.pathname);
      setOpenChatMenuId(null);
      setEditSession(null);
      setDraft("");
      setPendingFiles([]);
      setActiveChatId(nextChatId);
      setError(null);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    setIsMacPlatform(/Mac|iPhone|iPad/i.test(window.navigator.platform));
  }, []);

  useEffect(() => {
    const layout = chatLayoutRef.current;
    const header = chatHeaderRef.current;
    const composerWrap = composerWrapRef.current;
    if (!layout || !header || !composerWrap) return;

    const syncChatChromeOffsets = () => {
      layout.style.setProperty("--chat-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
      layout.style.setProperty("--chat-composer-height", `${Math.ceil(composerWrap.getBoundingClientRect().height)}px`);
    };

    syncChatChromeOffsets();

    const observer = new ResizeObserver(() => {
      syncChatChromeOffsets();
    });

    observer.observe(header);
    observer.observe(composerWrap);
    window.addEventListener("resize", syncChatChromeOffsets);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncChatChromeOffsets);
      layout.style.removeProperty("--chat-header-height");
      layout.style.removeProperty("--chat-composer-height");
    };
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const canChat =
    !!session &&
    !(session.actor.type === "guest" && !session.settings.guestEnabled);
  const hasActiveChat = Boolean(activeChatId);
  const editingMessageId = editSession?.messageId ?? null;
  const visibleMessages = useMemo(() => getVisibleMessages(messages, editingMessageId), [messages, editingMessageId]);
  const paneState = getConversationPaneState({
    hasActiveChat,
    conversationStatus,
    messageCount: visibleMessages.length,
  });
  const composerAvailability = getComposerAvailability({
    sessionStatus,
    canChat,
    sending,
    uploading,
    hasDraft: Boolean(draft.trim()),
    hasActiveChat,
    conversationStatus,
    editingMessage: Boolean(editingMessageId),
  });
  const composerCanType = composerAvailability.canType;
  const composerCanSend = composerAvailability.canSend;
  const normalizedSidebarQuery = sidebarQuery.trim().toLowerCase();
  const filteredChats = useMemo(() => {
    if (!normalizedSidebarQuery) return chats;
    const queryTokens = normalizedSidebarQuery.split(/\s+/).filter(Boolean);
    if (!queryTokens.length) return chats;

    const modelSearchTextById = new Map(
      (session?.models ?? []).map((model) => [model.id, `${model.id} ${model.displayName} ${model.provider}`.toLowerCase()]),
    );
    const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

    return chats.filter((chat) => {
      const createdDate = new Date(chat.createdAt);
      const updatedDate = new Date(chat.updatedAt);
      const createdText = Number.isNaN(createdDate.valueOf()) ? "" : dateFormatter.format(createdDate);
      const updatedText = Number.isNaN(updatedDate.valueOf()) ? "" : dateFormatter.format(updatedDate);
      const haystack = `${chat.title} ${chat.modelId} ${modelSearchTextById.get(chat.modelId) || ""} ${createdText} ${updatedText}`.toLowerCase();
      return queryTokens.every((token) => haystack.includes(token));
    });
  }, [chats, normalizedSidebarQuery, session?.models]);
  const showNoResults = normalizedSidebarQuery.length > 0 && filteredChats.length === 0;

  const handleNewChat = useCallback(() => {
    if (session) {
      removeCachedChatMessages(session.actor, DRAFT_CHAT_ID);
    }
    setOpenChatMenuId(null);
    setEditSession(null);
    syncChatPath();
    setMessages([]);
    setError(null);
    setDraft("");
    setPendingFiles([]);
    setActiveChatId(undefined);
  }, [session, syncChatPath]);

  const loadSession = useCallback(async () => {
    setSessionStatus((current) => (current === "ready" ? "ready" : "booting"));
    setSessionError(null);

    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Session request failed with ${response.status}`);
      }

      const data = (await response.json()) as SessionPayload;
      setSession(data);
      setSessionStatus("ready");
      cacheSessionSnapshot(data);
      setModelId(data.settings.defaultModelId || "gpt-4o-mini");

      if (data.actor.type === "user") {
        const settingsResponse = await fetch("/api/settings/user", { cache: "no-store" });
        if (settingsResponse.ok) {
          const settingsData = (await settingsResponse.json()) as { settings: { theme: "system" | "light" | "dark" } };
          setMode(settingsData.settings.theme);
        }
      }
    } catch {
      if (sessionMemoryCache) {
        setSession(sessionMemoryCache);
        setSessionStatus("ready");
        setSessionError("Could not refresh session; showing the last local snapshot.");
      } else {
        setSessionStatus("error");
        setSessionError("Could not load session data");
      }
    }
  }, [setMode]);

  const loadChats = useCallback(async () => {
    if (!session) {
      return;
    }

    const cachedChats = readCachedChats(session.actor);
    if (cachedChats.length) {
      setChats(cachedChats);
      setChatListStatus("ready");
    } else {
      setChatListStatus("loading");
    }

    if (session.degraded) {
      if (!cachedChats.length) {
        setChats([]);
      }
      setChatListStatus("ready");
      return;
    }

    try {
      const response = await fetch("/api/chats", { cache: "no-store" });
      if (!response.ok) {
        if (!cachedChats.length) {
          setSessionError("Could not load chat history right now.");
          setChatListStatus("error");
        }
        return;
      }

      const data = (await response.json()) as { chats: ChatSummary[] };
      setChats(data.chats);
      writeCachedChats(session.actor, data.chats);
      setChatListStatus("ready");
    } catch {
      if (!cachedChats.length) {
        setSessionError("Could not load chat history right now.");
        setChatListStatus("error");
      }
    }
  }, [session]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!session) {
        return;
      }

      loadChatAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      loadChatAbortControllerRef.current = abortController;
      const requestId = ++loadChatRequestIdRef.current;

      setConversationError(null);
      setConversationStatus("loading");

      const cachedMessages = readCachedChatMessages(session.actor, chatId);
      if (activeChatIdRef.current === chatId) {
        setMessages(cachedMessages);
      }

      if (session.degraded) {
        if (activeChatIdRef.current === chatId) {
          if (cachedMessages.length) {
            setConversationStatus("ready");
          } else {
            setConversationStatus("error");
            setConversationError(session.error || "Database is unavailable. Showing saved local chat data when available.");
          }
        }
        return;
      }

      let response: Response;
      try {
        response = await fetch(`/api/chats/${chatId}`, { cache: "no-store", signal: abortController.signal });
      } catch (fetchError) {
        const aborted = fetchError instanceof Error && fetchError.name === "AbortError";
        if (!aborted && activeChatIdRef.current === chatId) {
          if (cachedMessages.length) {
            setConversationStatus("ready");
            setConversationError("Could not refresh this chat from the server. Showing local copy.");
          } else {
            setConversationStatus("error");
            setConversationError("Could not load this conversation");
          }
        }
        return;
      }

      const isCurrentRequest = loadChatRequestIdRef.current === requestId;
      const isCurrentChat = activeChatIdRef.current === chatId;
      if (!isCurrentRequest || !isCurrentChat) {
        return;
      }

      if (!response.ok) {
        if (cachedMessages.length) {
          setConversationStatus("ready");
          setConversationError("Could not refresh this chat from the server. Showing local copy.");
        } else {
          setConversationStatus("error");
          setConversationError("Could not load this conversation");
        }
        return;
      }

      const data = (await response.json()) as {
        chat: {
          id: string;
          modelId: string;
          messages: ChatMessage[];
        };
      };

      setModelId(data.chat.modelId);
      setMessages(data.chat.messages);
      writeCachedChatMessages(session.actor, data.chat.id, data.chat.messages);
      setConversationStatus("ready");
      setConversationError(null);
    },
    [session],
  );

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session) return;
    void loadChats();
  }, [session, loadChats]);

  useEffect(() => {
    if (!session) {
      if (activeChatId) {
        setConversationStatus("loading");
      } else {
        setConversationStatus("idle");
      }
      return;
    }

    setEditSession(null);
    if (shouldResetDraftOnSelectionChange(lastDraftResetChatIdRef.current, activeChatId, DRAFT_CHAT_ID)) {
      setDraft("");
    }
    lastDraftResetChatIdRef.current = activeChatId;
    setConversationError(null);
    if (activeChatId) {
      const cachedMessages = readCachedChatMessages(session.actor, activeChatId);
      setMessages(cachedMessages);
      setConversationStatus("loading");
      void loadChat(activeChatId);
      return;
    }

    loadChatAbortControllerRef.current?.abort();
    const cachedDraftMessages = readCachedChatMessages(session.actor, DRAFT_CHAT_ID);
    setMessages(cachedDraftMessages);
    setConversationStatus("idle");
    setError(null);
  }, [activeChatId, loadChat, session]);

  useEffect(() => {
    if (!session) return;
    if (activeChatId) {
      writeCachedChatMessages(session.actor, activeChatId, messages);
      return;
    }
    writeCachedChatMessages(session.actor, DRAFT_CHAT_ID, messages);
  }, [activeChatId, messages, session]);

  useDismissibleMenu({
    enabled: isAttachMenuOpen,
    containerRef: attachMenuRef,
    onDismiss: closeAttachMenu,
  });

  useEffect(() => {
    if (!canChat) {
      setAttachMenuOpen(false);
    }
  }, [canChat]);

  useEffect(() => {
    if (editSession) {
      setAttachMenuOpen(false);
    }
  }, [editSession]);

  useDismissibleMenu({
    enabled: isProfileMenuOpen,
    containerRef: profileMenuRef,
    onDismiss: closeProfileMenu,
  });

  useDismissibleMenu({
    enabled: Boolean(openChatMenuId),
    containerRef: chatMenuRef,
    onDismiss: closeChatMenu,
  });

  useEffect(() => {
    function onSearchShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") {
        return;
      }
      const target = event.target;
      if (isEditableTarget(target) && target !== searchInputRef.current) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }

    document.addEventListener("keydown", onSearchShortcut);
    return () => {
      document.removeEventListener("keydown", onSearchShortcut);
    };
  }, []);

  useEffect(() => {
    function onNewChatShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !event.shiftKey || event.key.toLowerCase() !== "o") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      handleNewChat();
    }

    document.addEventListener("keydown", onNewChatShortcut);
    return () => {
      document.removeEventListener("keydown", onNewChatShortcut);
    };
  }, [handleNewChat]);

  useAutosizeTextarea(composerInputRef, draft);
  useEffect(() => {
    if (!editingMessageId) return;
    composerInputRef.current?.focus();
  }, [editingMessageId]);

  useEffect(() => {
    return () => {
      loadChatAbortControllerRef.current?.abort();
      if (copiedMessageTimeoutRef.current !== null) {
        window.clearTimeout(copiedMessageTimeoutRef.current);
      }
    };
  }, []);

  function updateStreamingMessage(messageId: string, content: string) {
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)));
  }

  function stopGenerating() {
    sendAbortControllerRef.current?.abort();
  }

  function handleMessageStreamScroll() {
    const stream = messageStreamRef.current;
    if (!stream) return;
    const distanceToBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 80;
  }

  useEffect(() => {
    const stream = messageStreamRef.current;
    if (!stream) return;
    if (!shouldStickToBottomRef.current) return;
    stream.scrollTop = stream.scrollHeight;
  }, [messages]);

  async function uploadPendingFiles() {
    if (!pendingFiles.length) return [] as UploadedFile[];

    const formData = new FormData();
    for (const file of pendingFiles) {
      formData.append("files", file);
    }

    setUploading(true);
    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { files: UploadedFile[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }
      return data.files;
    } finally {
      setUploading(false);
    }
  }

  async function readResponseError(response: Response) {
    let message = "Failed to send message";
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error || message;
    } catch {
      const fallback = await response.text();
      if (fallback.trim()) {
        message = fallback.slice(0, 240);
      }
    }
    return message;
  }

  async function readAssistantStream(response: Response, messageId: string, shouldApply?: () => boolean) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("The server stream is unavailable");
    }

    const decoder = new TextDecoder();
    let accumulated = "";
    let painted = "";
    let rafId: number | null = null;

    const flush = () => {
      rafId = null;
      if (shouldApply && !shouldApply()) return;
      if (painted === accumulated) return;
      painted = accumulated;
      updateStreamingMessage(messageId, painted);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    }

    accumulated += decoder.decode();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    flush();
    return accumulated;
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sanitizedDraft = draft.trimEnd();
    if (!sanitizedDraft.trim() || !composerCanSend) return;
    if (editingMessageId) {
      await submitEditedMessage();
      return;
    }
    setError(null);

    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      chatId: activeChatId || "pending",
      role: "user",
      content: sanitizedDraft,
      modelId,
      attachments: pendingFiles.map((file, index) => ({
        id: `pending-${index}`,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath: "",
      })),
      createdAt: new Date().toISOString(),
    };

    const optimisticMessages = [...messages, optimisticMessage];
    const optimisticAssistantId = `assistant-stream-${Date.now()}`;
    const optimisticAssistant: ChatMessage = {
      id: optimisticAssistantId,
      chatId: activeChatId || "pending",
      role: "assistant",
      content: "",
      modelId,
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    setMessages([...optimisticMessages, optimisticAssistant]);
    const currentDraft = sanitizedDraft;
    const originChatId = activeChatId;
    setDraft("");
    setSending(true);

    const abortController = new AbortController();
    sendAbortControllerRef.current = abortController;

    try {
      if (session?.degraded) {
        const degradedReply: ChatMessage = {
          id: `degraded-${Date.now()}`,
          chatId: activeChatId || "degraded",
          role: "assistant",
          content:
            "Database connection is unavailable right now. Your message is saved locally on this device. It will sync to server storage once database connectivity returns.",
          modelId,
          attachments: [],
          createdAt: new Date().toISOString(),
        };

        const offlineMessages = [...optimisticMessages, degradedReply];
        if (isChatStillSelected(originChatId)) {
          setMessages(offlineMessages);
        }
        if (session) {
          writeCachedChatMessages(session.actor, originChatId || DRAFT_CHAT_ID, offlineMessages);
        }
        if (isChatStillSelected(originChatId)) {
          setPendingFiles([]);
        }
        return;
      }

      const uploadedFiles = await uploadPendingFiles();
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: activeChatId,
          modelId,
          message: currentDraft,
          attachmentIds: uploadedFiles.map((file) => file.id),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }

      const responseChatId = response.headers.get("x-chat-id") || activeChatId;
      if (!responseChatId) {
        throw new Error("The server did not return a chat id");
      }

      const persistedMessages = [...optimisticMessages, optimisticAssistant].map((msg) =>
        msg.chatId === "pending" ? { ...msg, chatId: responseChatId } : msg,
      );

      if (session) {
        writeCachedChatMessages(session.actor, responseChatId, persistedMessages);
        removeCachedChatMessages(session.actor, DRAFT_CHAT_ID);
      }

      const shouldApplyToVisibleChat = isChatStillSelected(originChatId);
      if (shouldApplyToVisibleChat) {
        setActiveChatId(responseChatId);
        setMessages(persistedMessages);
        setPendingFiles([]);
        syncChatPath(responseChatId);
      }

      const accumulated = await readAssistantStream(response, optimisticAssistantId, () => isChatStillSelected(originChatId));

      const finalizedMessages = persistedMessages.map((msg) =>
        msg.id === optimisticAssistantId ? { ...msg, content: accumulated, chatId: responseChatId } : msg,
      );
      if (isChatStillSelected(originChatId)) {
        setMessages(finalizedMessages);
      }

      if (session) {
        writeCachedChatMessages(session.actor, responseChatId, finalizedMessages);
      }

      await loadChats();
      if (isChatStillSelected(responseChatId)) {
        await loadChat(responseChatId);
      }
    } catch (sendError) {
      const aborted = sendError instanceof Error && sendError.name === "AbortError";
      if (!aborted && isChatStillSelected(originChatId)) {
        setError(sendError instanceof Error ? sendError.message : "Failed to send message");
      }
      if (isChatStillSelected(originChatId)) {
        setMessages((prev) => {
          if (aborted) {
            return prev.filter((msg) => !(msg.id === optimisticAssistantId && !msg.content.trim()));
          }
          return prev.filter((msg) => msg.id !== optimisticMessage.id && msg.id !== optimisticAssistantId);
        });
      }
      if (!aborted && isChatStillSelected(originChatId)) {
        setDraft(currentDraft);
      }
    } finally {
      sendAbortControllerRef.current = null;
      setSending(false);
    }
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      if (copiedMessageTimeoutRef.current !== null) {
        window.clearTimeout(copiedMessageTimeoutRef.current);
      }
      copiedMessageTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
        copiedMessageTimeoutRef.current = null;
      }, 1600);
    } catch {
      setError("Could not copy message");
    }
  }

  function startEditingMessage(message: ChatMessage) {
    setError(null);
    setEditSession({
      messageId: message.id,
      originalMessages: messages,
      savedDraft: draft,
      savedPendingFiles: pendingFiles,
    });
    setDraft(message.content);
    setPendingFiles([]);
  }

  function cancelEditingMessage() {
    if (!editSession) return;
    setMessages(editSession.originalMessages);
    setDraft(editSession.savedDraft);
    setPendingFiles(editSession.savedPendingFiles);
    setEditSession(null);
    setError(null);
  }

  async function submitEditedMessage() {
    if (!editSession || !activeChatId) return;
    const sanitizedDraft = draft.trimEnd();
    if (!sanitizedDraft.trim() || !composerCanSend || session?.degraded) return;

    const targetIndex = editSession.originalMessages.findIndex((entry) => entry.id === editSession.messageId);
    if (targetIndex === -1) return;

    setError(null);

    const originalMessages = editSession.originalMessages;
    const optimisticAssistantId = `assistant-stream-${Date.now()}`;
    const message = originalMessages[targetIndex];
    const updatedMessage: ChatMessage = {
      ...message,
      content: sanitizedDraft,
    };
    const trimmedMessages = [...originalMessages.slice(0, targetIndex), updatedMessage];
    const optimisticAssistant: ChatMessage = {
      id: optimisticAssistantId,
      chatId: activeChatId,
      role: "assistant",
      content: "",
      modelId,
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    const optimisticMessages = [...trimmedMessages, optimisticAssistant];
    const currentDraft = sanitizedDraft;
    const originChatId = activeChatId;

    setEditSession(null);
    setMessages(optimisticMessages);
    setDraft("");
    setPendingFiles([]);
    setSending(true);

    const abortController = new AbortController();
    sendAbortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: activeChatId,
          editMessageId: editSession.messageId,
          modelId,
          message: currentDraft,
          attachmentIds: [],
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }

      const responseChatId = response.headers.get("x-chat-id") || activeChatId;
      if (!responseChatId) {
        throw new Error("The server did not return a chat id");
      }

      if (session) {
        writeCachedChatMessages(session.actor, responseChatId, optimisticMessages);
      }

      if (isChatStillSelected(originChatId)) {
        setActiveChatId(responseChatId);
        setMessages(optimisticMessages);
      }

      const accumulated = await readAssistantStream(response, optimisticAssistantId, () => isChatStillSelected(originChatId));
      const finalizedMessages = optimisticMessages.map((entry) =>
        entry.id === optimisticAssistantId ? { ...entry, content: accumulated, chatId: responseChatId } : entry,
      );

      if (isChatStillSelected(originChatId)) {
        setMessages(finalizedMessages);
      }
      if (session) {
        writeCachedChatMessages(session.actor, responseChatId, finalizedMessages);
      }

      await loadChats();
      if (isChatStillSelected(responseChatId)) {
        await loadChat(responseChatId);
      }
    } catch (sendError) {
      const aborted = sendError instanceof Error && sendError.name === "AbortError";
      if (!aborted && isChatStillSelected(originChatId)) {
        setError(sendError instanceof Error ? sendError.message : "Failed to send message");
      }
      if (isChatStillSelected(originChatId)) {
        setMessages(originalMessages);
        setEditSession(editSession);
        setDraft(currentDraft);
        setPendingFiles([]);
      }
      if (session) {
        writeCachedChatMessages(session.actor, originChatId || DRAFT_CHAT_ID, originalMessages);
      }
    } finally {
      sendAbortControllerRef.current = null;
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && editingMessageId) {
      event.preventDefault();
      cancelEditingMessage();
      return;
    }

    if (!shouldSubmitTextareaShortcut({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    })) {
      return;
    }

    event.preventDefault();
    if (!draft.trim() || !composerCanSend) {
      return;
    }
    composerFormRef.current?.requestSubmit();
  }

  async function removeChat(chatId: string) {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setOpenChatMenuId(null);
    if (session) {
      removeCachedChatMessages(session.actor, chatId);
    }
    await loadChats();
    if (chatId === activeChatId) {
      syncChatPath();
      if (session) {
        removeCachedChatMessages(session.actor, DRAFT_CHAT_ID);
      }
      setMessages([]);
      setActiveChatId(undefined);
    }
  }

  async function renameChat(chatId: string) {
    const existing = chats.find((chat) => chat.id === chatId);
    const proposed = window.prompt("Rename chat", existing?.title || "");
    setOpenChatMenuId(null);
    if (!proposed) return;

    const title = proposed.trim();
    if (!title || title === existing?.title) return;

    const response = await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      setError("Could not rename this chat");
      return;
    }

    await loadChats();
  }

  async function logout() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    clearSessionSnapshot();
    syncChatPath(undefined, { replace: true });
    await loadSession();
    await loadChats();
    setMessages([]);
    setActiveChatId(undefined);
    setProfileMenuOpen(false);
  }

  const nextPath = encodeURIComponent(buildChatPath(activeChatId));
  const activeChatTitle = activeChat?.title || (activeChatId ? "Conversation" : "New chat");
  const modelOptions: ModelOption[] =
    session?.models.length
      ? session.models
      : [
          {
            id: modelId,
            displayName: "Loading models...",
            provider: "system",
            description: "Model list will load shortly",
            isEnabled: true,
            isDefault: true,
            isGuestAllowed: true,
            maxOutputTokens: 2048,
          },
        ];

  return (
    <div ref={chatLayoutRef} className="chat-layout">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <p className="sidebar-brand">OpenChat</p>
          <button
            type="button"
            className="new-chat"
            onClick={handleNewChat}
            title={isMacPlatform ? "New chat (Cmd+Shift+O)" : "New chat (Ctrl+Shift+O)"}
          >
            <SquarePen size={14} />
            <span className="new-chat-label">New chat</span>
            <span className="new-chat-shortcut" aria-hidden="true">
              {isMacPlatform ? "Cmd+Shift+O" : "Ctrl+Shift+O"}
            </span>
          </button>
          <div className="sidebar-search">
            <Search size={14} className="sidebar-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="sidebar-search-input"
              placeholder="Search chats"
              aria-label="Search chats"
              value={sidebarQuery}
              onChange={(event) => {
                setSidebarQuery(event.target.value);
                setOpenChatMenuId(null);
              }}
            />
            {sidebarQuery ? (
              <button
                type="button"
                className="sidebar-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setSidebarQuery("");
                  searchInputRef.current?.focus();
                }}
              >
                <X size={12} />
              </button>
            ) : (
              <span className="sidebar-search-hint">{isMacPlatform ? "Cmd+K" : "Ctrl+K"}</span>
            )}
          </div>
        </div>

        <div className="chat-list" role="list">
          {showNoResults ? (
            <p className="chat-list-empty">No chats found.</p>
          ) : !filteredChats.length && chatListStatus === "loading" ? (
            <p className="chat-list-empty">Loading chats...</p>
          ) : !filteredChats.length ? (
            <p className="chat-list-empty">No chats yet.</p>
          ) : (
            filteredChats.map((chat) => (
              <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}>
                <a
                  href={buildChatPath(chat.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    if (chat.id !== activeChatId) {
                      setActiveChatId(chat.id);
                      setError(null);
                      syncChatPath(chat.id);
                    }
                    setOpenChatMenuId(null);
                  }}
                >
                  <span>{chat.title}</span>
                </a>
                <div className="chat-item-actions" ref={openChatMenuId === chat.id ? chatMenuRef : undefined}>
                  <button
                    type="button"
                    className="chat-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={openChatMenuId === chat.id}
                    title="Chat options"
                    onClick={() => setOpenChatMenuId((current) => (current === chat.id ? null : chat.id))}
                  >
                    <Ellipsis size={14} />
                  </button>
                  {openChatMenuId === chat.id ? (
                    <div className="chat-item-menu" role="menu">
                      <button type="button" onClick={() => void renameChat(chat.id)}>
                        Rename
                      </button>
                      <button type="button" onClick={() => void removeChat(chat.id)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {!session ? (
            <div className="sidebar-placeholder">
              <p className="guest-note">{sessionStatus === "error" ? "Could not load account details." : "Loading account..."}</p>
              {sessionStatus === "error" ? (
                <button type="button" onClick={() => void loadSession()} className="retry-button">
                  Retry
                </button>
              ) : null}
            </div>
          ) : session.actor.type === "user" ? (
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="profile-trigger"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setProfileMenuOpen((value) => !value)}
              >
                <span className="profile-avatar">{session.actor.user.name.slice(0, 1).toUpperCase()}</span>
                <span className="profile-copy">
                  <span className="profile-name">{session.actor.user.name}</span>
                  <span className="profile-email">{session.actor.user.email}</span>
                </span>
                <ChevronDown
                  size={14}
                  className="profile-caret"
                  style={{ transform: isProfileMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              {isProfileMenuOpen ? (
                <div className="profile-menu" role="menu">
                  <Link href="/settings" onClick={() => setProfileMenuOpen(false)}>
                    <Settings size={14} /> Settings
                  </Link>
                  {session.actor.roles.includes("admin") ? (
                    <Link href="/admin" onClick={() => setProfileMenuOpen(false)}>
                      <Shield size={14} /> Admin
                    </Link>
                  ) : null}
                  <button type="button" onClick={() => void logout()}>
                    <LogOut size={14} /> Logout
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <p className="guest-note">
                {session.settings.guestEnabled
                  ? "Guest mode is enabled. Sign in to save long-term history and personalize settings."
                  : "Guest mode is currently disabled by admin."}
              </p>
              <Link href={`/signin?next=${nextPath}`} className="signin-link">
                Sign in
              </Link>
            </>
          )}
        </div>
      </aside>

      <main ref={messageStreamRef} className="chat-main" onScroll={handleMessageStreamScroll}>
        <header ref={chatHeaderRef} className="chat-main-header">
          <div className="header-left">
            <ModelSelector models={modelOptions} modelId={modelId} onSelect={setModelId} />
            <h2 className="header-title">{activeChatTitle}</h2>
          </div>
          <div className="header-actions">
            {sessionStatus === "booting" ? (
              <span className="status-chip">
                <LoaderCircle className="spin" size={13} /> Connecting
              </span>
            ) : null}
            {sessionStatus === "error" ? (
              <span className="status-chip" title={sessionError || "Could not load session data"}>
                <AlertTriangle size={13} /> Session issue
              </span>
            ) : null}
            {sessionError ? (
              <span className="status-chip" title={sessionError}>
                <AlertTriangle size={13} /> Sync issue
              </span>
            ) : null}
            {session?.degraded ? (
              <span className="status-chip" title={session.error || "Database unavailable"}>
                <AlertTriangle size={13} /> Offline mode
              </span>
            ) : null}
            {session?.actor.type === "guest" ? <ThemeToggle /> : null}
          </div>
        </header>

        <section className="message-stream">
          {paneState === "loading" ? (
            <div className="conversation-state loading">
              <LoaderCircle className="spin" size={24} />
              <h3>Loading conversation...</h3>
              <p>You can type while we load previous messages.</p>
            </div>
          ) : paneState === "error" ? (
            <div className="conversation-state error">
              <h3>Could not load this conversation</h3>
              <p>{conversationError || "Try again in a moment."}</p>
              {activeChatId ? (
                <button type="button" onClick={() => void loadChat(activeChatId)} className="retry-button">
                  Retry
                </button>
              ) : null}
            </div>
          ) : paneState === "empty" ? (
            <div className="empty-state">
              <h3>{activeChatId ? "No messages in this conversation yet" : "Start a new conversation"}</h3>
              <p>
                {activeChatId
                  ? "Send a message to begin."
                  : "Ask anything, add files, and switch models from the top-left selector."}
              </p>
            </div>
          ) : (
            visibleMessages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                <div className={`message-stack ${message.role}`}>
                  <article className={`message ${message.role} ${editingMessageId === message.id ? "editing" : ""}`}>
                    {message.role === "user" ? (
                      <header>
                        <strong>You</strong>
                        <small>{new Date(message.createdAt).toLocaleTimeString()}</small>
                      </header>
                    ) : null}
                    <div className={`message-content ${message.role === "assistant" ? "markdown-content" : ""}`}>
                      {message.role === "assistant" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      ) : (
                        <p>{message.content}</p>
                      )}
                    </div>
                    {message.attachments.length ? (
                      <ul>
                        {message.attachments.map((file) => (
                          <li key={file.id}>
                            <FileText size={12} />
                            <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">
                              {file.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                  {editingMessageId !== message.id ? (
                    (() => {
                      const actionState = getMessageActionState(message, {
                        editingMessageId,
                        sending,
                        degraded: Boolean(session?.degraded),
                      });

                      if (!actionState.showCopy && !actionState.showEdit) {
                        return null;
                      }

                      return (
                        <div className={`message-actions ${message.role}`}>
                          {actionState.showCopy ? (
                            <button
                              type="button"
                              className={`message-action-button ${copiedMessageId === message.id ? "copied" : ""}`}
                              aria-label={copiedMessageId === message.id ? "Copied message" : "Copy message"}
                              title={copiedMessageId === message.id ? "Copied" : "Copy"}
                              onClick={() => void copyMessage(message)}
                            >
                              {copiedMessageId === message.id ? <Check size={15} /> : <Copy size={15} />}
                            </button>
                          ) : null}
                          {actionState.showEdit ? (
                            <button
                              type="button"
                              className="message-action-button"
                              aria-label="Edit message"
                              title="Edit"
                              onClick={() => startEditingMessage(message)}
                              disabled={actionState.disableEdit}
                            >
                              <SquarePen size={15} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={messageAnchor} className={visibleMessages.length ? "message-anchor has-messages" : "message-anchor"} />
        </section>

        <footer ref={composerWrapRef} className="composer-wrap">
            <form
              ref={composerFormRef}
              onSubmit={sendMessage}
              className="composer expanded"
            >
            {editSession ? (
              <div className="composer-editing">
                <span>Editing earlier message. Send to regenerate from here.</span>
                <button type="button" className="composer-editing-cancel" onClick={cancelEditingMessage} disabled={sending}>
                  Cancel
                </button>
              </div>
            ) : null}
            <div className="attach-menu-wrap" ref={attachMenuRef}>
              <button
                type="button"
                className="attach-icon-button"
                title="Add files"
                aria-haspopup="menu"
                aria-expanded={isAttachMenuOpen}
                disabled={composerAvailability.disableAttachments}
                onClick={() => setAttachMenuOpen((value) => !value)}
              >
                <Paperclip size={16} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                style={{ display: "none" }}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  setPendingFiles(files);
                  setAttachMenuOpen(false);
                }}
              />

              {isAttachMenuOpen ? (
                <div className="attach-menu" role="menu">
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Paperclip size={15} />
                    Add files
                  </button>
                </div>
              ) : null}
            </div>

            <textarea
              ref={composerInputRef}
              className="composer-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={editingMessageId ? "Edit the message, then send to regenerate" : "Ask anything"}
              rows={1}
              disabled={!composerCanType}
            />

            {sending ? (
              <button className="send-icon-button" type="button" onClick={stopGenerating} disabled={uploading} title="Stop generation">
                <Square size={13} />
              </button>
            ) : (
              <button className="send-icon-button" type="submit" disabled={!composerCanSend}>
                <SendHorizontal size={14} />
              </button>
            )}

            {pendingFiles.length ? (
              <div className="pending-files">
                {pendingFiles.map((file) => (
                  <span key={`${file.name}-${file.size}`}>{file.name}</span>
                ))}
              </div>
            ) : null}

            {error ? <p className="composer-error">{error}</p> : null}
          </form>
        </footer>
      </main>
    </div>
  );
}

