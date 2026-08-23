/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";
import { X, ExternalLink, FileText } from "lucide-react";

export function DocViewer({
  document: doc,
  highlightedChunk,
  onClose,
}: {
  document: Document | null;
  highlightedChunk?: string | null;
  onClose?: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) {
      setContent(null);
      return;
    }
    if (doc.mimeType?.includes("pdf")) {
      setContent(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/docs/${doc.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((j) => {
        if (!alive) return;
        setContent(String(j.document?.content ?? j.content ?? ""));
      })
      .catch(() => setContent(doc.title + "\n\n[preview unavailable]"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [doc]);

  if (!doc) {
    return (
      <div className="doc-viewer">
        <div className="doc-viewer-body" style={{ display: "grid", placeItems: "center", color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface-muted)", display: "grid", placeItems: "center", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              <FileText size={18} />
            </div>
            <p className="eyebrow">Doc viewer</p>
            <p style={{ fontSize: "0.84rem", maxWidth: 220, lineHeight: 1.5 }}>Select a citation chip in the chat to preview its highlighted chunk here.</p>
          </div>
        </div>
      </div>
    );
  }

  const isPdf = doc.mimeType?.includes("pdf") || doc.title.toLowerCase().endsWith(".pdf");

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-header">
        <div style={{ minWidth: 0, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flex: "0 0 32px", border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)" }}>
            <FileText size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>{doc.title}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
              <span className="badge" style={{ textTransform: "capitalize" }}>
                {doc.status}
              </span>
              {doc.pageCount ? <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{doc.pageCount} pages</span> : null}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <a className="btn btn-sm" href={`/api/docs/${doc.id}`} target="_blank" rel="noreferrer" style={{ gap: 5 }}>
            Open <ExternalLink size={12} />
          </a>
          {onClose ? (
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close viewer">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="doc-viewer-body">
        {loading ? <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>Loading…</p> : null}
        {isPdf ? <PdfPlaceholder title={doc.title} highlightedChunk={highlightedChunk ?? null} /> : <MarkdownPreview content={content ?? ""} highlightedChunk={highlightedChunk ?? null} />}
      </div>
    </div>
  );
}

function PdfPlaceholder({ title, highlightedChunk }: { title: string; highlightedChunk: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="doc-viewer-page">
        <p className="eyebrow">PDF preview</p>
        <p style={{ fontSize: "0.86rem", marginTop: 8, color: "var(--text-secondary)", lineHeight: 1.6 }}>{title} — highlight for cited chunk:</p>
        <div style={{ marginTop: 10, border: "1px dashed var(--border)", borderRadius: 10, padding: 14, background: "var(--surface-muted)", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6 }}>
          {highlightedChunk ? <span className="doc-highlight">{highlightedChunk}</span> : <span style={{ color: "var(--text-muted)" }}>No highlight — select a citation.</span>}
        </div>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>Full PDF rendering requires S3 presigned URL. Chunk text is grounded via citations.</p>
    </div>
  );
}

function MarkdownPreview({ content, highlightedChunk }: { content: string; highlightedChunk: string | null }) {
  if (!content) return <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>No preview text.</p>;
  const parts = highlightedChunk ? content.split(highlightedChunk) : [content];
  return (
    <div style={{ fontSize: "0.88rem", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-primary)" }}>
      {highlightedChunk && parts.length > 1
        ? parts.flatMap((p, i) => (i === parts.length - 1 ? [p] : [p, <mark key={i} className="doc-highlight">{highlightedChunk}</mark>]))
        : content}
    </div>
  );
}
