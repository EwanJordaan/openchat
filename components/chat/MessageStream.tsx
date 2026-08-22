"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ChatMessage, Citation } from "@/lib/types";

function normalizeLatex(input: string): string {
  return input.replace(/\\\(/g, "$").replace(/\\\)/g, "$").replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");
}

export function MessageStream({
  messages,
  onCitationClick,
}: {
  messages: ChatMessage[];
  onCitationClick?: (c: Citation) => void;
}) {
  if (!messages.length) {
    return (
      <div className="message-stream">
        <div style={{ margin: "auto", textAlign: "center", maxWidth: 520, padding: 24 }}>
          <p className="eyebrow">OpenChat</p>
          <h3 style={{ marginTop: 6 }}>Start a conversation</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.86rem", marginTop: 8 }}>Drop docs on the left or ask anything. Citations appear as chips — click to open in the viewer.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="message-stream" data-testid="message-stream">
      {messages.map((m) => (
        <div key={m.id} className={`message-row ${m.role}`}>
          <div className="message-stack" style={{ width: m.role === "assistant" ? "100%" : undefined }}>
            <article className={`message ${m.role}`}>
              <header>
                <strong style={{ fontSize: "0.78rem" }}>{m.role === "user" ? "You" : m.role === "assistant" ? "OpenChat" : m.role}</strong>
                <small>{new Date(m.createdAt).toLocaleTimeString()}</small>
              </header>
              {m.role === "assistant" ? (
                <div className="markdown-content">
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}>
                      {normalizeLatex(m.content)}
                    </ReactMarkdown>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>Thinking…</span>
                  )}
                </div>
              ) : (
                <div className="message-content"><p>{m.content}</p></div>
              )}
              {m.citations?.length ? (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.citations.map((c) => (
                    <button key={c.chunkId} type="button" className="citation-chip" onClick={() => onCitationClick?.(c)} title={c.excerpt ?? c.chunkId}>
                      {c.title ?? c.documentId.slice(0, 8)} {c.page ? `p${c.page}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </div>
      ))}
      <div className="message-anchor" aria-hidden />
    </div>
  );
}
