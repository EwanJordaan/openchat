"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  LoaderCircle,
  LogOut,
  Plus,
  SendHorizontal,
  Settings,
  Shield,
  SquarePen,
  Trash2,
  UserRound,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/providers/theme-provider";
import type { Actor, ChatMessage, ChatSummary, ModelOption, PublicAppSettings, UploadedFile } from "@/lib/types";

const CHAT_CACHE_KEY = "openchat:chat-list";

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

export function ChatWorkspace({ initialChatId }: { initialChatId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setMode } = useTheme();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(initialChatId);

  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState("gpt-4o-mini");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messageAnchor = useAutoScroll(messages.length);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) || null, [chats, activeChatId]);

  const canChat =
    !!session &&
    !session.degraded &&
    !(session.actor.type === "guest" && !session.settings.guestEnabled);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await response.json()) as SessionPayload;
      setSession(data);
      setModelId(data.settings.defaultModelId || "gpt-4o-mini");

      if (data.actor.type === "user") {
        const settingsResponse = await fetch("/api/settings/user", { cache: "no-store" });
        if (settingsResponse.ok) {
          const settingsData = (await settingsResponse.json()) as { settings: { theme: "system" | "light" | "dark" } };
          setMode(settingsData.settings.theme);
        }
      }
    } catch {
      setSessionError("Could not load session data");
    } finally {
      setSessionLoading(false);
    }
  }, [setMode]);

  const loadChats = useCallback(async () => {
    if (!session || session.degraded) {
      setChats([]);
      return;
    }

    const cacheKey = `${CHAT_CACHE_KEY}:${actorCacheKey(session.actor)}`;
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      setChats(JSON.parse(cachedRaw) as ChatSummary[]);
    }

    const response = await fetch("/api/chats", { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load chat history. Check database connection.");
      return;
    }

    const data = (await response.json()) as { chats: ChatSummary[] };
    setChats(data.chats);
    localStorage.setItem(cacheKey, JSON.stringify(data.chats));
  }, [session]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!session || session.degraded) {
        setMessages([]);
        setError("Database is unavailable. Update DATABASE_URL to continue.");
        return;
      }

      const response = await fetch(`/api/chats/${chatId}`, { cache: "no-store" });
      if (!response.ok) {
        setError("This chat is unavailable");
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
    setActiveChatId(initialChatId);
    if (initialChatId) {
      void loadChat(initialChatId);
      return;
    }
    setMessages([]);
  }, [initialChatId, loadChat]);

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
    if (!draft.trim() || sending || !canChat) return;
    setError(null);

    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      chatId: activeChatId || "pending",
      role: "user",
      content: draft,
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

    setMessages((prev) => [...prev, optimisticMessage]);
    const currentDraft = draft;
    setDraft("");
    setSending(true);

    try {
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
      });

      const data = (await response.json()) as { chatId?: string; error?: string };
      if (!response.ok || !data.chatId) {
        throw new Error(data.error || "Failed to send message");
      }

      setPendingFiles([]);
      if (pathname === "/" || activeChatId !== data.chatId) {
        router.push(`/chat/${data.chatId}`);
      }

      await loadChats();
      await loadChat(data.chatId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to send message");
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
      setDraft(currentDraft);
    } finally {
      setSending(false);
    }
  }

  async function removeChat(chatId: string) {
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    await loadChats();
    if (chatId === activeChatId) {
      router.push("/");
      setMessages([]);
      setActiveChatId(undefined);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    await loadSession();
    await loadChats();
    setMessages([]);
    setActiveChatId(undefined);
  }

  if (sessionLoading) {
    return (
      <div className="chat-loading">
        <LoaderCircle className="spin" size={28} />
        <p>Preparing your workspace...</p>
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
          <p className="sidebar-brand">OpenChat</p>
          <button
            type="button"
            className="new-chat"
            onClick={() => {
              router.push("/");
              setMessages([]);
              setActiveChatId(undefined);
            }}
          >
            <SquarePen size={14} />
            New chat
          </button>
        </div>

        <div className="chat-list" role="list">
          {chats.map((chat) => (
            <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}>
              <Link href={`/chat/${chat.id}`}>
                <span>{chat.title}</span>
                <small>{new Date(chat.updatedAt).toLocaleDateString()}</small>
              </Link>
              <button type="button" onClick={() => void removeChat(chat.id)} title="Archive chat">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          {session.actor.type === "user" ? (
            <>
              <div className="identity-row">
                <UserRound size={14} />
                <span>{session.actor.user.name}</span>
              </div>
              <div className="sidebar-links">
                <Link href="/settings">
                  <Settings size={14} /> Settings
                </Link>
                {session.actor.roles.includes("admin") ? (
                  <Link href="/admin">
                    <Shield size={14} /> Admin
                  </Link>
                ) : null}
                <button type="button" onClick={() => void logout()}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </>
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

      <main className="chat-main">
        <header className="chat-main-header">
          <div className="header-left">
            <ModelSelector models={session.models} modelId={modelId} onSelect={setModelId} />
            <h2 className="header-title">{activeChat?.title || "New chat"}</h2>
          </div>
          <div className="header-actions">
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
              <article key={message.id} className={`message ${message.role}`}>
                <header>
                  <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                  <small>{new Date(message.createdAt).toLocaleTimeString()}</small>
                </header>
                <p>{message.content}</p>
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
            ))
          )}
          <div ref={messageAnchor} />
        </section>

        <footer className="composer-wrap">
          <form onSubmit={sendMessage} className="composer">
            <textarea
              className="composer-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything"
              rows={1}
              disabled={sending || uploading || !canChat}
            />

            <div className="composer-toolbar">
              <label className="attach-icon-button" title="Add files">
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    setPendingFiles(files);
                  }}
                />
                <Plus size={16} />
              </label>

              <button className="send-icon-button" type="submit" disabled={sending || uploading || !canChat || !draft.trim()}>
                {sending ? <LoaderCircle size={14} className="spin" /> : <SendHorizontal size={14} />}
              </button>
            </div>

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
