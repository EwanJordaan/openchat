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

const messages: Message[] = [
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

function roleBadge(role: Role) {
  if (role === "assistant") return "AI";
  if (role === "user") return "You";
  return "System";
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-root)] text-[var(--text-primary)]">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <main className="relative mx-auto flex h-screen w-full max-w-[1600px] gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-5 lg:p-5">
        <aside className="surface hidden w-72 shrink-0 flex-col overflow-hidden md:flex">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="brand-chip">
                  <SparkIcon />
                </span>
                <div>
                  <p className="text-sm font-semibold tracking-wide">OpenChat</p>
                  <p className="text-xs text-[var(--text-muted)]">Workspace Alpha</p>
                </div>
              </div>
              <button className="rounded-lg border border-white/15 bg-[var(--accent-primary)]/8 px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-primary)]/60 hover:bg-[var(--accent-primary)]/16 hover:text-[var(--accent-primary-strong)]">
                Ctrl+K
              </button>
            </div>

            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-primary)]/55 bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110">
              <SparkIcon />
              New conversation
            </button>
          </div>

          <div className="scrollbar-chat flex-1 space-y-2 overflow-y-auto p-3">
            {conversations.map((conversation) => (
              <button
                key={conversation.title}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  conversation.active
                    ? "border-[var(--accent-secondary)]/55 bg-[var(--accent-secondary)]/14"
                    : "border-white/10 bg-white/[0.03] hover:border-[var(--accent-primary)]/28 hover:bg-[var(--accent-primary)]/8"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <span className="text-xs text-[var(--text-dim)]">{conversation.time}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                  {conversation.preview}
                </p>
                {conversation.pinned ? (
                  <span className="mt-2 inline-flex rounded-full border border-[var(--accent-primary)]/42 bg-[var(--accent-primary)]/16 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent-primary-strong)]">
                    Pinned
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="surface relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="scrollbar-chat flex-1 space-y-4 overflow-y-auto px-3 py-4 pb-24 sm:px-5 sm:py-5 sm:pb-28">
            {messages.map((message, index) => {
              const isUser = message.role === "user";

              return (
                <article
                  key={`${message.time}-${index}`}
                  className={`message-enter flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {!isUser ? (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] text-[10px] font-bold text-slate-950">
                      {roleBadge(message.role)}
                    </div>
                  ) : null}

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

            <article className="message-enter flex gap-3" style={{ animationDelay: "420ms" }}>
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] text-[10px] font-bold text-slate-950">
                AI
              </div>
              <div className="flex items-center gap-1 px-2 py-3">
                <span className="typing-dot" />
                <span className="typing-dot [animation-delay:150ms]" />
                <span className="typing-dot [animation-delay:300ms]" />
              </div>
            </article>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-5 sm:pb-4">
            <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[var(--bg-root)] px-1.5 py-1">
              <button className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-dim)] transition hover:text-[var(--accent-primary-strong)]">
                +
              </button>
              <input
                type="text"
                className="peer h-7 flex-1 bg-transparent px-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)]"
                placeholder="Ask OpenChat to draft, summarize, or brainstorm..."
              />
              <button
                aria-label="Send message"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-secondary)] text-slate-950 transition hover:brightness-110 peer-placeholder-shown:hidden"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
