"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Role = "assistant" | "user" | "system";

type Conversation = {
  title: string;
  preview: string;
  time: string;
  pinned?: boolean;
  active?: boolean;
};

type Message = {
  role: Role;
  content: string;
  time: string;
};

const conversations: Conversation[] = [
  {
    title: "Landing page copy refresh",
    preview: "Drafting two variants with a calmer CTA.",
    time: "2m",
    pinned: true,
    active: true,
  },
  {
    title: "Weekly product digest",
    preview: "Summaries are ready, adding key takeaways.",
    time: "18m",
    pinned: true,
  },
  {
    title: "Support macro writing",
    preview: "Polished response templates in plain tone.",
    time: "1h",
  },
  {
    title: "Recruiting outreach",
    preview: "Follow-up sequence with subject line tests.",
    time: "3h",
  },
  {
    title: "Roadmap brainstorming",
    preview: "Tradeoffs for Q2 backlog re-prioritization.",
    time: "Yesterday",
  },
];

const initialMessages: Message[] = [
  {
    role: "system",
    content:
      "You are assisting with product messaging. Keep answers concise, grounded, and action-oriented.",
    time: "10:02",
  },
  {
    role: "user",
    content:
      "Give me a homepage hero section for an AI support copilot targeted at SaaS teams. Keep it bold but not too hype.",
    time: "10:04",
  },
  {
    role: "assistant",
    content:
      "Here is a clean direction:\n\n**Headline**: Resolve tickets in half the time, with answers your team can trust.\n\n**Subheadline**: OpenChat learns your docs, past resolutions, and product tone so every reply is faster, clearer, and on-brand.\n\n**Primary CTA**: Start free\n\n**Secondary CTA**: See a live demo",
    time: "10:05",
  },
  {
    role: "user",
    content:
      "Nice. Add three value bullets under it focused on impact for support leaders.",
    time: "10:06",
  },
  {
    role: "assistant",
    content:
      "- Increase first-response speed with AI-assisted drafts that agents can send in seconds.\n- Improve consistency with policy-aware answers grounded in your internal knowledge base.\n- Track quality and deflection trends with built-in analytics for coaching and planning.",
    time: "10:07",
  },
];

function getCurrentTimeLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function getTemporaryAssistantMessage(userMessage: string) {
  // TODO: Replace this with the real function/API call that gets assistant messages.
  return `Temporary response: I can help with this request. Next, wire this to your backend so replies come from the model.\n\nYou said: "${userMessage}"`;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 2.5 14.7 8l5.8.8-4.2 4 1 5.7-5.3-2.8-5.3 2.8 1-5.7-4.2-4 5.8-.8L12 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 19a.75.75 0 0 1-.75-.75V7.56l-2.97 2.97a.75.75 0 1 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06l-2.97-2.97v10.69A.75.75 0 0 1 12 19Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
      <path
        d="M4 7.75h16a.75.75 0 0 0 0-1.5H4a.75.75 0 0 0 0 1.5Zm16 3.5H4a.75.75 0 0 0 0 1.5h16a.75.75 0 0 0 0-1.5Zm0 5H4a.75.75 0 0 0 0 1.5h16a.75.75 0 0 0 0-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 5.5v13m-6.5-6.5h13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Home() {
  const [openMenuTitle, setOpenMenuTitle] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarContentVisible, setIsSidebarContentVisible] = useState(true);
  const [chatMessages, setChatMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const sidebarContentTimerRef = useRef<number | null>(null);
  const assistantReplyTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const hasOpenMenu = openMenuTitle !== null;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-history-menu]")) return;
      setOpenMenuTitle(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuTitle(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarContentTimerRef.current !== null) {
        window.clearTimeout(sidebarContentTimerRef.current);
      }

      if (assistantReplyTimerRef.current !== null) {
        window.clearTimeout(assistantReplyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const chatContainer = chatScrollRef.current;
    if (!chatContainer) {
      return;
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, [chatMessages, isAssistantTyping]);

  function toggleSidebar() {
    setOpenMenuTitle(null);

    if (sidebarContentTimerRef.current !== null) {
      window.clearTimeout(sidebarContentTimerRef.current);
      sidebarContentTimerRef.current = null;
    }

    if (isSidebarCollapsed) {
      setIsSidebarContentVisible(false);
      setIsSidebarCollapsed(false);
      sidebarContentTimerRef.current = window.setTimeout(() => {
        setIsSidebarContentVisible(true);
        sidebarContentTimerRef.current = null;
      }, 210);
      return;
    }

    setIsSidebarContentVisible(false);
    setIsSidebarCollapsed(true);
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAssistantTyping) {
      return;
    }

    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: trimmedDraft,
      time: getCurrentTimeLabel(),
    };

    setChatMessages((prevMessages) => [...prevMessages, userMessage]);
    setDraft("");
    setIsAssistantTyping(true);

    assistantReplyTimerRef.current = window.setTimeout(() => {
      const assistantMessage: Message = {
        role: "assistant",
        content: getTemporaryAssistantMessage(trimmedDraft),
        time: getCurrentTimeLabel(),
      };

      setChatMessages((prevMessages) => [...prevMessages, assistantMessage]);
      setIsAssistantTyping(false);
      assistantReplyTimerRef.current = null;
    }, 650);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-root)] text-[var(--text-primary)]">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <main className="relative mx-auto flex h-screen w-full max-w-[1600px] gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-5 lg:p-5">
        <aside
          className={`surface hidden shrink-0 flex-col overflow-hidden transition-[width] duration-200 md:flex ${
            isSidebarCollapsed ? "w-14" : "w-72"
          }`}
        >
          <div className="border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={toggleSidebar}
                className="group/toggle brand-chip relative h-8 w-8 shrink-0 border border-white/20 p-0 text-slate-100 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/toggle:opacity-0 group-focus-visible/toggle:opacity-0">
                  <SparkIcon />
                </span>
                <span className="absolute inset-0 flex items-center justify-center text-slate-950 opacity-0 transition-opacity duration-150 group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100">
                  <MenuIcon />
                </span>
              </button>
              <div className={isSidebarContentVisible ? "block" : "hidden"}>
                <p className="text-sm font-semibold tracking-wide">OpenChat</p>
              </div>
            </div>

            {isSidebarContentVisible ? (
              <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-primary)]/55 bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                <PlusIcon />
                <span className="whitespace-nowrap">New chat</span>
              </button>
            ) : (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  aria-label="New chat"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent-primary)]/60 bg-transparent text-[var(--accent-primary)] transition hover:bg-[var(--accent-primary)]/12 hover:text-[var(--accent-primary-strong)]"
                >
                  <PlusIcon />
                </button>
              </div>
            )}
          </div>

          <div
            className={`scrollbar-chat flex-1 space-y-2 overflow-y-auto p-3 ${
              isSidebarContentVisible ? "block" : "hidden"
            }`}
          >
            {conversations.map((conversation) => {
              const isMenuOpen = openMenuTitle === conversation.title;

              return (
                <div
                  key={conversation.title}
                  data-history-menu
                  className={`group/history relative ${isMenuOpen ? "z-30" : "z-0"}`}
                >
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 pr-11 text-left transition ${
                      conversation.active
                        ? "border-[var(--accent-secondary)]/55 bg-[var(--accent-secondary)]/14"
                        : hasOpenMenu
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-white/10 bg-white/[0.03] hover:border-[var(--accent-primary)]/28 hover:bg-[var(--accent-primary)]/8"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{conversation.title}</p>
                  </button>

                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      aria-label={`Open menu for ${conversation.title}`}
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setOpenMenuTitle(isMenuOpen ? null : conversation.title)}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-[var(--bg-root)] text-sm leading-none transition hover:text-[var(--text-primary)] ${
                        isMenuOpen
                          ? "pointer-events-auto text-[var(--text-primary)] opacity-100"
                          : "pointer-events-none text-[var(--text-dim)] opacity-0 group-hover/history:pointer-events-auto group-hover/history:opacity-100 group-focus-within/history:pointer-events-auto group-focus-within/history:opacity-100"
                      }`}
                    >
                      ...
                    </button>

                    <div
                      role="menu"
                      aria-label={`Actions for ${conversation.title}`}
                      className={`absolute right-0 top-full z-30 mt-1 w-32 rounded-lg border border-white/12 bg-[var(--bg-root)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition ${
                        isMenuOpen
                          ? "pointer-events-auto visible translate-y-0 opacity-100"
                          : "pointer-events-none invisible translate-y-1 opacity-0"
                      }`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setOpenMenuTitle(null)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-primary)]/18 hover:text-[var(--accent-primary-strong)]"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setOpenMenuTitle(null)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-primary)]/18 hover:text-[var(--accent-primary-strong)]"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setOpenMenuTitle(null)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-primary)]/18 hover:text-[var(--accent-primary-strong)]"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setOpenMenuTitle(null)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] transition hover:bg-[var(--accent-secondary)]/20 hover:text-[var(--accent-secondary-strong)]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="surface relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={chatScrollRef}
            className="scrollbar-chat flex-1 space-y-4 overflow-y-auto px-3 py-4 pb-24 sm:px-5 sm:py-5 sm:pb-28"
          >
            {chatMessages.map((message, index) => {
              const isUser = message.role === "user";

              return (
                <article
                  key={`${message.time}-${index}`}
                  className={`message-enter flex ${isUser ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div
                    className={`max-w-[85%] px-1 py-1 sm:max-w-[75%] ${
                      isUser
                        ? "rounded-2xl border border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary)]/16 px-4 py-3"
                        : ""
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-primary)]">
                        {message.content}
                      </p>
                    ) : (
                      <div className="markdown-content text-sm leading-6 text-[var(--text-primary)]">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-[var(--text-dim)]">{message.time}</p>
                  </div>
                </article>
              );
            })}

            {isAssistantTyping ? (
              <article className="message-enter flex" style={{ animationDelay: "120ms" }}>
                <div className="flex items-center gap-1 px-2 py-3">
                  <span className="typing-dot" />
                  <span className="typing-dot [animation-delay:150ms]" />
                  <span className="typing-dot [animation-delay:300ms]" />
                </div>
              </article>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-5 sm:pb-4">
            <form
              onSubmit={handleSendMessage}
              className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[var(--bg-root)] px-1.5 py-1"
            >
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-dim)] transition hover:text-[var(--accent-primary-strong)]"
              >
                +
              </button>
              <input
                type="text"
                className="peer h-7 flex-1 bg-transparent px-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)]"
                placeholder="Ask OpenChat to draft, summarize, or brainstorm..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={isAssistantTyping}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-secondary)] text-slate-950 transition hover:brightness-110 peer-placeholder-shown:hidden disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
