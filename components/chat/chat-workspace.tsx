"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/providers/theme-provider";
import { UserSettingsPanel } from "@/components/settings/user-settings-panel";
import type { Actor, ChatMessage, ChatSummary, ModelOption, PublicAppSettings, UploadedFile } from "@/lib/types";

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
  const current = models.find((model) => model.id === modelId) || models[0];

  return (
    <div className="model-selector">
      <button type="button" className="model-trigger" onClick={() => setOpen((value) => !value)}>
        <span>{current?.displayName ?? "Select model"}</span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="model-menu">
          {models.map((model) => (
            <button
              type="button"
              key={model.id}
              className={`model-option ${model.id === modelId ? "active" : ""}`}
              onClick={() => {
                onSelect(model.id);
                setOpen(false);
              }}
            >
              <div>
                <p className="model-option-label">{model.displayName}</p>
                <p className="model-option-desc">{model.description}</p>
              </div>
              <span className="model-option-provider">{model.provider}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OpenChatGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.4 8.25a3.6 3.6 0 1 0 0 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14.6 8.25h0.35a3.6 3.6 0 1 1 0 7.5h-0.35" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 8.25v7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

export function ChatWorkspace({ initialChatId }: { initialChatId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setMode } = useTheme();
  const [isHydrated, setIsHydrated] = useState(false);

  const initialSessionRef = useRef<SessionPayload | null | undefined>(undefined);
  if (initialSessionRef.current === undefined) {
    initialSessionRef.current = getInitialSessionSnapshot();
  }
  const initialSession = initialSessionRef.current;

  const initialChatsRef = useRef<ChatSummary[] | undefined>(undefined);
  if (initialChatsRef.current === undefined) {
    initialChatsRef.current = initialSession ? readCachedChats(initialSession.actor) : [];
  }

  const initialMessagesRef = useRef<ChatMessage[] | undefined>(undefined);
  if (initialMessagesRef.current === undefined) {
    if (initialSession) {
      initialMessagesRef.current = readCachedChatMessages(initialSession.actor, initialChatId || DRAFT_CHAT_ID);
    } else {
      initialMessagesRef.current = [];
    }
  }

  const [session, setSession] = useState<SessionPayload | null>(initialSession || null);
  const [sessionLoading, setSessionLoading] = useState(!initialSession);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatSummary[]>(initialChatsRef.current || []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessagesRef.current || []);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(initialChatId);

  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState("gpt-4o-mini");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAttachMenuOpen, setAttachMenuOpen] = useState(false);

  const messageAnchor = useAutoScroll(messages.length);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) || null, [chats, activeChatId]);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageStreamRef = useRef<HTMLElement | null>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const chatMenuRef = useRef<HTMLDivElement | null>(null);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);
  const [isChatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const isSettingsOverlayOpen = searchParams.get("settings") === "1";
  const filteredChats = useMemo(() => {
    const query = chatSearchQuery.trim().toLocaleLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => chat.title.toLocaleLowerCase().includes(query));
  }, [chats, chatSearchQuery]);

  const closeSettingsOverlay = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("settings");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const openSettingsOverlay = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("settings", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setIsHydrated(true);
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

  const loadSession = useCallback(async ({ showLoader = false }: { showLoader?: boolean } = {}) => {
    if (showLoader) {
      setSessionLoading(true);
    }
    setSessionError(null);

    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Session request failed with ${response.status}`);
      }

      const data = (await response.json()) as SessionPayload;
      setSession(data);
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
        setSessionError("Could not refresh session; showing the last local snapshot.");
      } else {
        setSessionError("Could not load session data");
      }
    } finally {
      setSessionLoading(false);
    }
  }, [setMode]);

  const loadChats = useCallback(async () => {
    if (!session) {
      return;
    }

    const cachedChats = readCachedChats(session.actor);
    if (cachedChats.length) {
      setChats(cachedChats);
    }

    if (session.degraded) {
      if (!cachedChats.length) {
        setChats([]);
      }
      return;
    }

    try {
      const response = await fetch("/api/chats", { cache: "no-store" });
      if (!response.ok) {
        if (!cachedChats.length) {
          setError("Could not load chat history right now.");
        }
        return;
      }

      const data = (await response.json()) as { chats: ChatSummary[] };
      setChats(data.chats);
      writeCachedChats(session.actor, data.chats);
    } catch {
      if (!cachedChats.length) {
        setError("Could not load chat history right now.");
      }
    }
  }, [session]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!session) {
        return;
      }

      const cachedMessages = readCachedChatMessages(session.actor, chatId);
      if (cachedMessages.length) {
        setMessages(cachedMessages);
      }

      if (session.degraded) {
        setError(session.error || "Database is unavailable. Showing saved local chat data when available.");
        return;
      }

      const response = await fetch(`/api/chats/${chatId}`, { cache: "no-store" });
      if (!response.ok) {
        if (cachedMessages.length) {
          setError("Could not refresh this chat from the server. Showing local copy.");
        } else {
          setError("This chat is unavailable");
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

      setActiveChatId(data.chat.id);
      setModelId(data.chat.modelId);
      setMessages(data.chat.messages);
      writeCachedChatMessages(session.actor, data.chat.id, data.chat.messages);
      setError(null);
    },
    [session],
  );

  useEffect(() => {
    void loadSession({ showLoader: !initialSession });
  }, [loadSession, initialSession]);

  useEffect(() => {
    if (!session) return;
    void loadChats();
  }, [session, loadChats]);

  useEffect(() => {
    if (!session) return;

    setActiveChatId(initialChatId);
    if (initialChatId) {
      const cachedMessages = readCachedChatMessages(session.actor, initialChatId);
      setMessages(cachedMessages);
      void loadChat(initialChatId);
      return;
    }

    setMessages([]);
    setError(null);
  }, [initialChatId, loadChat, session]);

  useEffect(() => {
    if (!session) return;
    if (activeChatId) {
      writeCachedChatMessages(session.actor, activeChatId, messages);
      return;
    }
    if (pathname === "/") {
      writeCachedChatMessages(session.actor, DRAFT_CHAT_ID, messages);
    }
  }, [activeChatId, messages, pathname, session]);

  useEffect(() => {
    if (!isAttachMenuOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!attachMenuRef.current?.contains(target)) {
        setAttachMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAttachMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isAttachMenuOpen]);

  useEffect(() => {
    if (!canChat) {
      setAttachMenuOpen(false);
    }
  }, [canChat]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (!openChatMenuId) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!chatMenuRef.current?.contains(target)) {
        setOpenChatMenuId(null);
        setConfirmDeleteChatId(null);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenChatMenuId(null);
        setConfirmDeleteChatId(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [openChatMenuId]);

  useEffect(() => {
    if (!isChatSearchOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!searchMenuRef.current?.contains(target)) {
        closeSearchChats();
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearchChats();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isChatSearchOpen]);

  useEffect(() => {
    if (!isChatSearchOpen) return;
    chatSearchInputRef.current?.focus();
  }, [isChatSearchOpen]);

  useEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;

    const maxHeight = 140;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sanitizedDraft = draft.trimEnd();
    if (!sanitizedDraft.trim() || sending || !canChat) return;
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
        setMessages(offlineMessages);
        if (session) {
          writeCachedChatMessages(session.actor, activeChatId || DRAFT_CHAT_ID, offlineMessages);
        }
        setPendingFiles([]);
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
        throw new Error(message);
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

      setActiveChatId(responseChatId);
      setMessages(persistedMessages);
      setPendingFiles([]);
      if (pathname === "/" || activeChatId !== responseChatId) {
        router.push(`/chat/${responseChatId}`);
      }

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
        if (painted === accumulated) return;
        painted = accumulated;
        updateStreamingMessage(optimisticAssistantId, painted);
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

      const finalizedMessages = persistedMessages.map((msg) =>
        msg.id === optimisticAssistantId ? { ...msg, content: accumulated, chatId: responseChatId } : msg,
      );
      setMessages(finalizedMessages);

      if (session) {
        writeCachedChatMessages(session.actor, responseChatId, finalizedMessages);
      }

      await loadChats();
      await loadChat(responseChatId);
    } catch (sendError) {
      const aborted = sendError instanceof Error && sendError.name === "AbortError";
      if (!aborted) {
        setError(sendError instanceof Error ? sendError.message : "Failed to send message");
      }
      setMessages((prev) => {
        if (aborted) {
          return prev.filter((msg) => !(msg.id === optimisticAssistantId && !msg.content.trim()));
        }
        return prev.filter((msg) => msg.id !== optimisticMessage.id && msg.id !== optimisticAssistantId);
      });
      if (!aborted) {
        setDraft(currentDraft);
      }
    } finally {
      sendAbortControllerRef.current = null;
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (!draft.trim() || sending || uploading || !canChat) {
      return;
    }
    composerFormRef.current?.requestSubmit();
  }

  async function removeChat(chatId: string) {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setOpenChatMenuId(null);
    setConfirmDeleteChatId(null);
    if (session) {
      removeCachedChatMessages(session.actor, chatId);
    }
    await loadChats();
    if (chatId === activeChatId) {
      router.push("/");
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
    await fetch("/api/auth/logout", { method: "POST" });
    clearSessionSnapshot();
    router.push("/");
    await loadSession();
    await loadChats();
    setMessages([]);
    setActiveChatId(undefined);
    setProfileMenuOpen(false);
  }

  function toggleSearchChats() {
    if (isChatSearchOpen) {
      setChatSearchOpen(false);
      setChatSearchQuery("");
      return;
    }
    setChatSearchOpen(true);
  }

  function closeSearchChats() {
    setChatSearchOpen(false);
    setChatSearchQuery("");
  }

  if (!isHydrated || (sessionLoading && !session)) {
    return (
      <div className="chat-loading">
        <LoaderCircle className="spin" size={28} />
        <p>Loading chat...</p>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="chat-loading">
        <p>{sessionError || "Could not initialize session"}</p>
        <button type="button" onClick={() => void loadSession()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  const nextPath = encodeURIComponent(pathname || "/");

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <span className="sidebar-brand-mark">
              <OpenChatGlyph className="sidebar-brand-icon" />
            </span>
            <p className="sidebar-brand">OpenChat</p>
          </div>

          <div className="sidebar-nav">
            <button
              type="button"
              className="sidebar-nav-item"
              onClick={() => {
                if (session) {
                  removeCachedChatMessages(session.actor, DRAFT_CHAT_ID);
                }
                setOpenChatMenuId(null);
                router.push("/");
                setMessages([]);
                setError(null);
                setPendingFiles([]);
                setActiveChatId(undefined);
              }}
            >
              <SquarePen className="sidebar-nav-icon" size={18} strokeWidth={1.9} />
              <span>New chat</span>
            </button>

            <div className={`sidebar-search-menu ${isChatSearchOpen ? "open" : ""}`} ref={searchMenuRef}>
              <button
                type="button"
                className={`sidebar-nav-item ${isChatSearchOpen ? "active search-open" : ""}`}
                onClick={toggleSearchChats}
                aria-expanded={isChatSearchOpen}
                aria-controls="chat-search-input"
              >
                <Search className="sidebar-nav-icon" size={18} strokeWidth={1.9} />
                <span>Search chats</span>
              </button>

              {isChatSearchOpen ? (
                <div className="sidebar-search-panel">
                  <input
                    ref={chatSearchInputRef}
                    id="chat-search-input"
                    className="sidebar-search-input"
                    type="search"
                    value={chatSearchQuery}
                    onChange={(event) => setChatSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeSearchChats();
                      }
                    }}
                    placeholder="Search your chats"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="chat-list-section">
          <p className="chat-list-heading">Your chats</p>

          <div className="chat-list" role="list">
            {filteredChats.length ? (
              filteredChats.map((chat) => (
                <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}>
                  <Link href={`/chat/${chat.id}`}>
                    <span>{chat.title}</span>
                  </Link>
                  <div className="chat-item-actions" ref={openChatMenuId === chat.id ? chatMenuRef : undefined}>
                    <button
                      type="button"
                      className="chat-menu-trigger"
                      aria-haspopup="menu"
                      aria-expanded={openChatMenuId === chat.id}
                      title="Chat options"
                      onClick={() => {
                        setConfirmDeleteChatId(null);
                        setOpenChatMenuId((current) => (current === chat.id ? null : chat.id));
                      }}
                    >
                      <Ellipsis size={16} strokeWidth={2} />
                    </button>
                    {openChatMenuId === chat.id ? (
                      <div className="chat-item-menu" role="menu">
                        <button type="button" onClick={() => void renameChat(chat.id)}>
                          Rename
                        </button>
                        {confirmDeleteChatId === chat.id ? (
                          <>
                            <button
                              type="button"
                              className="chat-item-menu-delete-confirm"
                              onClick={() => void removeChat(chat.id)}
                            >
                              <Trash2 size={13} /> Confirm delete
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteChatId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="chat-item-menu-delete"
                            onClick={() => setConfirmDeleteChatId(chat.id)}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="chat-list-empty">
                {chatSearchQuery ? "No chats match your search." : "No chats yet."}
              </p>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          {session.actor.type === "user" ? (
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
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      openSettingsOverlay();
                    }}
                  >
                    <Settings size={14} /> Settings
                  </button>
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
        <header className="chat-main-header">
          <div className="header-left">
            <ModelSelector models={session.models} modelId={modelId} onSelect={setModelId} />
            <h2 className="header-title">{activeChat?.title || "New chat"}</h2>
          </div>
          <div className="header-actions">
            {sessionError ? (
              <span className="status-chip" title={sessionError}>
                <AlertTriangle size={13} /> Sync issue
              </span>
            ) : null}
            {session.degraded ? (
              <span className="status-chip" title={session.error || "Database unavailable"}>
                <AlertTriangle size={13} /> Offline mode
              </span>
            ) : null}
            {session.actor.type === "guest" ? <ThemeToggle /> : null}
          </div>
        </header>

        <section className="message-stream">
          {!messages.length ? (
            <div className="empty-state">
              <h3>Start a new conversation</h3>
              <p>Ask anything, add files, and switch models from the top-left selector.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                <article className={`message ${message.role}`}>
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
              </div>
            ))
          )}
          <div ref={messageAnchor} />
        </section>

        <footer className="composer-wrap">
            <form
              ref={composerFormRef}
              onSubmit={sendMessage}
              className="composer expanded"
            >
            <div className="attach-menu-wrap" ref={attachMenuRef}>
              <button
                type="button"
                className="attach-icon-button"
                title="Add files"
                aria-haspopup="menu"
                aria-expanded={isAttachMenuOpen}
                disabled={!canChat || sending || uploading}
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
              placeholder="Ask anything"
              rows={1}
              disabled={sending || uploading || !canChat}
            />

            {sending ? (
              <button className="send-icon-button" type="button" onClick={stopGenerating} disabled={uploading || !canChat} title="Stop generation">
                <Square size={13} />
              </button>
            ) : (
              <button className="send-icon-button" type="submit" disabled={uploading || !canChat || !draft.trim()}>
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

      {isSettingsOverlayOpen ? <UserSettingsPanel mode="overlay" onClose={closeSettingsOverlay} /> : null}
    </div>
  );
}
