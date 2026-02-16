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
      "Here is a clean direction:\n\nHeadline: Resolve tickets in half the time, with answers your team can trust.\nSubheadline: OpenChat learns your docs, past resolutions, and product tone so every reply is faster, clearer, and on-brand.\nPrimary CTA: Start free\nSecondary CTA: See a live demo",
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

const suggestions = [
  "Turn this into a concise A/B test matrix",
  "Shorten the headline to 7 words",
  "Match tone to enterprise buyers",
  "Generate a social post from this",
];

const tools = ["Web browse", "Knowledge base", "Code mode", "Image insights"];

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
        d="m3.4 11.5 15.8-7.3c.9-.4 1.8.5 1.4 1.4l-7.3 15.8c-.4.9-1.8.8-2.1-.2l-1.5-5.1-5.1-1.5c-1-.3-1.1-1.7-.2-2.1Z"
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

            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110">
              <SparkIcon />
              New conversation
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
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

        <section className="surface flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-b border-white/10 px-3 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  Active Chat
                </p>
                <h1 className="text-lg font-semibold sm:text-xl">
                  Landing page copy refresh
                </h1>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="rounded-full border border-[var(--accent-primary)]/42 bg-[var(--accent-primary)]/15 px-3 py-1 text-xs font-medium text-[var(--accent-primary-strong)]">
                  Model: GPT-5.3
                </span>
                <span className="rounded-full border border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary)]/16 px-3 py-1 text-xs font-medium text-[var(--accent-secondary-strong)]">
                  Streaming On
                </span>
              </div>
            </div>

            <div className="mt-3 flex gap-2 sm:hidden">
              <button className="rounded-lg border border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/14 px-3 py-1.5 text-xs text-[var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/22">
                Menu
              </button>
              <button className="rounded-lg border border-[var(--accent-secondary)]/35 bg-[var(--accent-secondary)]/14 px-3 py-1.5 text-xs text-[var(--accent-secondary-strong)] transition hover:bg-[var(--accent-secondary)]/22">
                Context
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
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
                    className={`max-w-[85%] rounded-2xl border px-4 py-3 sm:max-w-[75%] ${
                      isUser
                        ? "border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary)]/16"
                        : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-primary)]">
                      {message.content}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--text-dim)]">{message.time}</p>
                  </div>
                </article>
              );
            })}

            <article className="message-enter flex gap-3" style={{ animationDelay: "420ms" }}>
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] text-[10px] font-bold text-slate-950">
                AI
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="typing-dot" />
                <span className="typing-dot [animation-delay:150ms]" />
                <span className="typing-dot [animation-delay:300ms]" />
              </div>
            </article>
          </div>

          <div className="border-t border-white/10 px-3 py-3 sm:px-5 sm:py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-secondary)]/40 hover:bg-[var(--accent-secondary)]/14 hover:text-[var(--text-primary)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <button className="rounded-xl border border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/12 p-2 text-[var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/20">
                +
              </button>
              <textarea
                rows={2}
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)]"
                placeholder="Ask OpenChat to draft, summarize, or brainstorm..."
              />
              <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                Send
                <SendIcon />
              </button>
            </div>
          </div>
        </section>

        <aside className="hidden w-80 shrink-0 flex-col gap-3 xl:flex">
          <section className="surface-soft p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Session
            </p>
            <h2 className="mt-2 text-sm font-semibold">Creative Assistant</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              Tuned for product writing, launch messaging, and concise B2B copy.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                Temp 0.7
              </span>
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                Max 1.2k
              </span>
            </div>
          </section>

          <section className="surface-soft p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Tools
            </p>
            <div className="mt-3 space-y-2">
              {tools.map((tool) => (
                <label
                  key={tool}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  {tool}
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 accent-[var(--accent-primary)]"
                    defaultChecked={tool !== "Image insights"}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="surface-soft p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Prompt Tips
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
              <li>State goal + audience in one line.</li>
              <li>Share constraints before asking for variants.</li>
              <li>Ask for a rubric when evaluating outputs.</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
