"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Actor, ChatMessage, ChatSummary, ModelOption, PublicAppSettings, UploadedFile } from "@/lib/types";

const CHAT_CACHE_KEY = "openchat:chat-list";

interface SessionPayload {
  actor: Actor;
  settings: PublicAppSettings;
  models: ModelOption[];
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

function AuthPanel({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = mode === "login" ? { email, password } : { email, password, name };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      setPassword("");
      await onAuthenticated();
    } catch {
      setError("Network error while signing in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
      </div>

      {mode === "register" ? (
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada Lovelace" required minLength={2} maxLength={80} />
        </label>
      ) : null}

      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          required
          minLength={8}
          maxLength={128}
        />
      </label>

      {error ? <p className="auth-error">{error}</p> : null}

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? <LoaderCircle size={14} className="spin" /> : <LogIn size={14} />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
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
        <span>
          <strong>{current?.displayName ?? "Select model"}</strong>
          <small>{current?.description ?? "No model selected"}</small>
        </span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="model-menu">
          {models.map((model) => (
            <button
              type="button"
              key={model.id}
              className={model.id === modelId ? "active" : ""}
              onClick={() => {
                onSelect(model.id);
                setOpen(false);
              }}
            >
              <span>{model.displayName}</span>
              <small>{model.provider.toUpperCase()}</small>
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

  async function loadSession() {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await response.json()) as SessionPayload;
      setSession(data);
      setModelId((current) => current || data.settings.defaultModelId);
    } catch {
      setSessionError("Could not load session data");
    } finally {
      setSessionLoading(false);
    }
  }

  const loadChats = useCallback(async () => {
    const cacheKey = `${CHAT_CACHE_KEY}:${actorCacheKey(session?.actor ?? null)}`;
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cachedChats = JSON.parse(cachedRaw) as ChatSummary[];
      setChats(cachedChats);
    }

    const response = await fetch("/api/chats", { cache: "no-store" });
    const data = (await response.json()) as { chats: ChatSummary[] };
    setChats(data.chats);
    localStorage.setItem(cacheKey, JSON.stringify(data.chats));
  }, [session?.actor]);

  const loadChat = useCallback(async (chatId: string) => {
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
  }, []);

  useEffect(() => {
    void loadSession();
  }, []);

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
    if (!draft.trim() || sending) return;
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

      const data = (await response.json()) as { chatId?: string; message?: string; error?: string };
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

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">OpenChat</p>
            <h1>Conversations</h1>
          </div>
          <button
            type="button"
            className="new-chat"
            onClick={() => {
              router.push("/");
              setMessages([]);
              setActiveChatId(undefined);
            }}
          >
            <Plus size={14} />
            New
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
                  ? "Guest mode enabled. Sign in to keep permanent history and role-based controls."
                  : "Guest mode is currently disabled by admin."}
              </p>
              <AuthPanel
                onAuthenticated={async () => {
                  await loadSession();
                  await loadChats();
                }}
              />
            </>
          )}
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-main-header">
          <div>
            <h2>{activeChat?.title || "New chat"}</h2>
            <p>{session.actor.type === "guest" ? "Guest session" : `${session.actor.roles.join(", ")} role`}</p>
          </div>
          <div className="header-actions">
            <ModelSelector models={session.models} modelId={modelId} onSelect={setModelId} />
            <ThemeToggle />
          </div>
        </header>

        <section className="message-stream">
          {!messages.length ? (
            <div className="empty-state">
              <h3>Start a new conversation</h3>
              <p>
                Ask anything, attach files, and switch models instantly. Your chat will be saved once your first message is sent.
              </p>
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
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message OpenChat..."
              rows={2}
              disabled={sending || uploading || (session.actor.type === "guest" && !session.settings.guestEnabled)}
            />

            <div className="composer-actions">
              <label className="attach-button">
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    setPendingFiles(files);
                  }}
                />
                <FileText size={14} />
                Add files
              </label>

              <button type="submit" disabled={sending || uploading || !draft.trim()}>
                {sending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
                Send
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
