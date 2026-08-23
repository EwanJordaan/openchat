"use client";

import useSWR from "swr";
import type { ChatSummary } from "@/lib/types";
import { Pin, PinOff } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ChatList({
  projectId,
  activeId,
  onSelect,
  filter,
}: {
  projectId?: string | null;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  filter?: string;
}) {
  const key = projectId ? `/api/chats?projectId=${encodeURIComponent(projectId)}` : "/api/chats";
  const { data, mutate } = useSWR<{ chats: ChatSummary[] }>(key, fetcher);
  let chats = data?.chats ?? [];
  const fq = filter?.trim() ?? "";
  if (fq) {
    const q = fq.toLowerCase();
    chats = chats.filter((c) => (c.title ?? "").toLowerCase().includes(q));
  }
  const pinned = chats.filter((c) => c.isPinned);
  const rest = chats.filter((c) => !c.isPinned);

  async function togglePin(c: ChatSummary) {
    await fetch(`/api/chats/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: !c.isPinned }) });
    void mutate();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1, overflow: "hidden" }}>
      <div className="chat-list">
        {chats.length === 0 && !filter ? (
          <div
            style={{
              border: "1px dashed var(--border)",
              borderRadius: 12,
              padding: "12px 10px",
              textAlign: "center",
              background: "color-mix(in srgb, var(--surface-muted) 60%, transparent)",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>No chats yet</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>Start a new conversation above</div>
          </div>
        ) : null}

        {fq && chats.length === 0 ? (
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 6px", textAlign: "center" }}>No chats match “{fq}”.</div>
        ) : null}

        {pinned.length ? <div className="eyebrow" style={{ padding: "6px 6px 2px" }}>Pinned</div> : null}
        {pinned.map((c) => (
          <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
            <button type="button" className="chat-item-title" onClick={() => onSelect?.(c.id)} title={c.title || "Untitled"}>
              {c.title || "Untitled"}
            </button>
            <button type="button" className="btn btn-icon ghost" style={{ width: 26, height: 26, flex: "0 0 26px" }} onClick={() => void togglePin(c)} aria-label="Unpin">
              <PinOff size={12} />
            </button>
          </div>
        ))}

        {rest.length ? (
          <div className="eyebrow" style={{ padding: "10px 6px 2px", display: pinned.length ? undefined : "none" }}>
            Recent
          </div>
        ) : null}
        {rest.length && !pinned.length && chats.length ? <div className="eyebrow" style={{ padding: "6px 6px 2px" }}>Recents</div> : null}

        {rest.map((c) => (
          <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
            <button type="button" className="chat-item-title" onClick={() => onSelect?.(c.id)} title={c.title || "Untitled"}>
              {c.title || "Untitled"}
            </button>
            <button type="button" className="btn btn-icon ghost" style={{ width: 26, height: 26, flex: "0 0 26px", opacity: 0.7 }} onClick={() => void togglePin(c)} aria-label="Pin">
              <Pin size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
