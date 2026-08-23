"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ChatMessage, Citation } from "@/lib/types";
import { FileText, Search, Sparkles, PenLine } from "lucide-react";

function normalizeLatex(input: string): string {
  return input.replace(/\\\(/g, "$").replace(/\\\)/g, "$").replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
}

const PROMPTS: Array<{ title: string; desc: string; prompt: string; icon: React.ReactNode }> = [
  { title: "Summarize documents", desc: "Get a grounded summary with citations", prompt: "Summarize the key points from my documents with citations", icon: <FileText size={14} /> },
  { title: "Find answers", desc: "Ask anything about your docs", prompt: "What are the most important insights in my documents?", icon: <Search size={14} /> },
  { title: "Create & write", desc: "Draft a doc from your sources", prompt: "Create a one-page briefing memo from my documents", icon: <PenLine size={14} /> },
  { title: "Deep analysis", desc: "Compare risks, extract tables", prompt: "Analyze risks and opportunities across my documents in a table", icon: <Sparkles size={14} /> },
];

export function MessageStream({
  messages,
  onCitationClick,
  onPromptClick,
}: {
  messages: ChatMessage[];
  onCitationClick?: (c: Citation) => void;
  onPromptClick?: (prompt: string) => void;
}) {
  if (!messages.length) {
    return (
      <div className="message-stream" data-testid="message-stream" style={{ flex: 1, overflow: "auto" }}>
        <div className="empty-hero">
          <div className="empty-hero-inner">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: "var(--accent)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 6px 20px rgba(124,58,237,0.35)",
                  fontWeight: 700,
                }}
              >
                ◐
              </div>
              <h1 className="empty-title">Where knowledge begins</h1>
              <p className="empty-subtitle">
                Chat with your documents — grounded answers, inline citations, and an agent that can search, read, and act. Drop PDFs or ask anything.
              </p>
            </div>

            <div className="prompt-grid">
              {PROMPTS.map((p) => (
                <button key={p.title} type="button" className="prompt-card" onClick={() => onPromptClick?.(p.prompt)}>
                  <div className="prompt-card-title">
                    <span className="prompt-card-icon">{p.icon}</span>
                    {p.title}
                  </div>
                  <div className="prompt-card-desc">{p.desc}</div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", display: "inline-block" }} aria-hidden />
              Your documents are the source of truth — citations appear below every grounded answer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-stream" data-testid="message-stream">
      {messages.map((m) => (
        <div key={m.id} className={`message-row ${m.role}`}>
          {m.role === "assistant" ? <div className="msg-avatar assistant">◐</div> : null}
          <div className="message-stack" style={{ flex: m.role === "assistant" ? 1 : undefined, minWidth: 0, maxWidth: m.role === "user" ? "100%" : undefined }}>
            <article className={`message ${m.role}`}>
              {m.role === "assistant" ? (
                <>
                  <header>
                    <strong>OpenChat</strong>
                    <small>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                  </header>
                  <div className="markdown-content">
                    {m.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
                      >
                        {normalizeLatex(m.content)}
                      </ReactMarkdown>
                    ) : (
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.88rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span className="spin" style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: 99, display: "inline-block" }} aria-hidden />
                        Thinking…
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="message-content">
                  <p>{m.content}</p>
                </div>
              )}
              {m.citations?.length ? (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.citations.map((c) => (
                    <button
                      key={c.chunkId}
                      type="button"
                      className="citation-chip"
                      onClick={() => onCitationClick?.(c)}
                      title={c.excerpt ?? c.chunkId}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", display: "inline-block", flex: "0 0 6px" }} aria-hidden />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.title ?? c.documentId.slice(0, 8)}</span>
                      {c.page ? <span style={{ color: "var(--text-muted)" }}>p{c.page}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
          {m.role === "user" ? <div className="msg-avatar user">You</div> : null}
        </div>
      ))}
      <div className="message-anchor" aria-hidden />
    </div>
  );
}
