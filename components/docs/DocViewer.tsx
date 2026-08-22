/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";

export function DocViewer({
  document: doc,
  highlightedChunk,
}: {
  document: Document | null;
  highlightedChunk?: string | null;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) {
      setContent(null);
      return;
    }
    if (doc.mimeType?.includes("pdf")) {
      // pdf placeholder — real would use pdfjs
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
          <div>
            <p className="eyebrow">Doc viewer</p>
            <p style={{ fontSize: "0.86rem" }}>Select a cited doc to preview its highlighted chunk here.</p>
          </div>
        </div>
      </div>
    );
  }

  const isPdf = doc.mimeType?.includes("pdf") || doc.title.toLowerCase().endsWith(".pdf");

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
          <div className="badge" style={{ marginTop: 4 }}>{doc.status}</div>
        </div>
        <a className="btn" href={`/api/docs/${doc.id}`} target="_blank" rel="noreferrer">Open</a>
      </div>
      <div className="doc-viewer-body">
        {loading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : null}
        {isPdf ? <PdfPlaceholder title={doc.title} highlightedChunk={highlightedChunk ?? null} /> : <MarkdownPreview content={content ?? ""} highlightedChunk={highlightedChunk ?? null} />}
      </div>
    </div>
  );
}

function PdfPlaceholder({ title, highlightedChunk }: { title: string; highlightedChunk: string | null }) {
  return (
    <div className="doc-viewer-page">
      <p className="eyebrow">PDF preview</p>
      <p style={{ fontSize: "0.86rem", marginTop: 6 }}>{title} — PDF rendering requires object URL. Highlight for cited chunk: {highlightedChunk ?? "none"}</p>
      <div style={{ marginTop: 10, border: "1px dashed var(--border)", borderRadius: 8, padding: 12, color: "var(--text-muted)", fontSize: "0.78rem" }}>Page stub — integrate pdfjs-dist when S3 url available.</div>
    </div>
  );
}

function MarkdownPreview({ content, highlightedChunk }: { content: string; highlightedChunk: string | null }) {
  if (!content) return <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>No preview text.</p>;
  const parts = highlightedChunk ? content.split(highlightedChunk) : [content];
  return (
    <div style={{ fontSize: "0.88rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {highlightedChunk && parts.length > 1
        ? parts.flatMap((p, i) => (i === parts.length - 1 ? [p] : [p, <mark key={i} className="doc-highlight">{highlightedChunk}</mark>]))
        : content}
    </div>
  );
}
