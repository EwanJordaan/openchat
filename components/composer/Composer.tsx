"use client";

import { useEffect, useRef, useState } from "react";
import { useAutosizeTextarea, shouldSubmitTextareaShortcut } from "./useAutosizeTextarea";
import { Paperclip, ArrowUp, Square } from "lucide-react";

type Preset = "research" | "analyst" | "builder";

export function Composer({
  onSend,
  onStop,
  isStreaming,
  draft,
  setDraft,
  projectId,
}: {
  onSend: (text: string, opts: { preset?: Preset; modelId?: string }) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  draft: string;
  setDraft: (v: string) => void;
  projectId?: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preset, setPreset] = useState<Preset>("research");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [docs, setDocs] = useState<Array<{ id: string; title: string }>>([]);
  useAutosizeTextarea(ref, draft, { maxHeight: 160, minHeight: 24 });

  const canSend = draft.trim().length > 0 && !isStreaming;

  useEffect(() => {
    if (!projectId) return;
    if (!mentionOpen) return;
    fetch(`/api/docs?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j.documents ?? []) as Array<{ id: string; title: string }>;
        setDocs(mentionQuery ? list.filter((d) => d.title.toLowerCase().includes(mentionQuery.toLowerCase())) : list.slice(0, 6));
      })
      .catch(() => setDocs([]));
  }, [mentionOpen, mentionQuery, projectId]);

  function submit() {
    if (!canSend) return;
    onSend(draft, { preset });
  }

  return (
    <div className="composer-wrap">
      <div className="composer-shell">
        <div className="composer">
          {/* mention dropdown */}
          {mentionOpen ? (
            <div className="composer-mention">
              <div className="eyebrow" style={{ padding: "2px 6px 6px" }}>
                Mention docs in this project
              </div>
              {docs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start", marginTop: 2, fontSize: "0.82rem" }}
                  onClick={() => {
                    setDraft(draft.replace(/@\S*$/, `@${d.title} `));
                    setMentionOpen(false);
                    ref.current?.focus();
                  }}
                >
                  {d.title}
                </button>
              ))}
              {docs.length === 0 ? <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: 6 }}>No docs.</div> : null}
            </div>
          ) : null}

          <div className="composer-main">
            <button
              type="button"
              className="attach-btn"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              onChange={(e) => {
                // trigger dropzone via global event or just show filename in draft
                const files = e.target.files;
                if (!files?.length) return;
                const names = Array.from(files)
                  .map((f) => f.name)
                  .join(", ");
                setDraft((draft ? draft + " " : "") + `[attach: ${names}] `);
                if (fileRef.current) fileRef.current.value = "";
                ref.current?.focus();
              }}
            />
            <textarea
              ref={ref}
              className="composer-input"
              placeholder="Ask anything — @mention docs to ground it…"
              value={draft}
              onChange={(e) => {
                const v = e.target.value;
                setDraft(v);
                const at = v.lastIndexOf("@");
                if (at !== -1 && at >= v.length - 30) {
                  setMentionOpen(true);
                  setMentionQuery(v.slice(at + 1).split(/\s/)[0] ?? "");
                } else if (at === -1) setMentionOpen(false);
              }}
              onKeyDown={(e) => {
                if (
                  shouldSubmitTextareaShortcut({
                    key: e.key,
                    shiftKey: e.shiftKey,
                    isComposing: (e.nativeEvent as unknown as { isComposing?: boolean }).isComposing,
                  })
                ) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
            />
            {isStreaming ? (
              <button type="button" className="icon-btn" aria-label="Stop" onClick={() => onStop?.()} style={{ color: "var(--text-primary)" }}>
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                className="icon-btn primary"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                title={canSend ? "Send (Enter)" : "Type a message"}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="composer-toolbar">
            <div className="composer-actions-left">
              <label className="model-pill" aria-label="Agent preset">
                <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", display: "inline-block" }} aria-hidden />
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  style={{ border: 0, background: "transparent", outline: "none", color: "inherit", fontSize: "inherit", fontWeight: 600, cursor: "pointer" }}
                >
                  <option value="research">Research</option>
                  <option value="analyst">Analyst</option>
                  <option value="builder">Builder</option>
                </select>
              </label>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "none" }} className="sm:inline">
                  ⏎ send · ⇧⏎ newline
                </span>
              </span>
            </div>
            <div className="composer-actions-right">
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{draft.length ? `${draft.length} chars` : "Grounds answers in your docs"}</span>
            </div>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: "0.68rem", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.4 }}>
          OpenChat can make mistakes. Check citations and sources.
        </p>
      </div>
    </div>
  );
}
