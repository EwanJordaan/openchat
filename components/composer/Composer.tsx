"use client";

import { useEffect, useRef, useState } from "react";
import { useAutosizeTextarea, shouldSubmitTextareaShortcut } from "./useAutosizeTextarea";

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
  const [preset, setPreset] = useState<Preset>("research");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [docs, setDocs] = useState<Array<{ id: string; title: string }>>([]);
  useAutosizeTextarea(ref, draft, { maxHeight: 140, minHeight: 44 });

  const canSend = draft.trim().length > 0 && !isStreaming;
  const expanded = draft.length > 80 || draft.includes("\n");

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
      <div className={`composer ${expanded ? "expanded" : ""}`}>
        <textarea
          ref={ref}
          className="composer-input"
          placeholder="Ask or @mention docs…"
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
            if (shouldSubmitTextareaShortcut({ key: e.key, shiftKey: e.shiftKey, isComposing: (e.nativeEvent as unknown as { isComposing?: boolean }).isComposing })) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
        />
        {mentionOpen ? (
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 12, right: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-elevated)", boxShadow: "var(--shadow)", padding: 6, zIndex: 5, maxHeight: 160, overflow: "auto" }}>
            <div className="eyebrow" style={{ padding: "2px 6px" }}>Mention docs in this project</div>
            {docs.map((d) => (
              <button key={d.id} type="button" className="btn" style={{ width: "100%", justifyContent: "flex-start", marginTop: 4 }} onClick={() => { setDraft(draft.replace(/@\S*$/, `@${d.title} `)); setMentionOpen(false); }}>{d.title}</button>
            ))}
            {docs.length === 0 ? <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: 6 }}>No docs.</div> : null}
          </div>
        ) : null}
        <div className="attach-menu-wrap" aria-hidden />
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "6px 10px", background: "var(--surface)", color: "var(--text-secondary)", fontSize: "0.78rem" }} aria-label="Agent preset">
            <option value="research">Research</option>
            <option value="analyst">Analyst</option>
            <option value="builder">Builder</option>
          </select>
          {isStreaming ? (
            <button type="button" className="btn" onClick={() => onStop?.()} style={{ borderRadius: 999 }}>Stop</button>
          ) : (
            <button type="button" className="btn primary" onClick={submit} disabled={!canSend} style={{ borderRadius: 999, width: 42, height: 42, justifyContent: "center", padding: 0 }} aria-label="Send">
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
