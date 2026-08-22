"use client";

import useSWR from "swr";
import type { ChatSummary } from "@/lib/types";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ChatList({
  projectId,
  activeId,
  onSelect,
  onNew,
}: {
  projectId?: string | null;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onNew?: () => void;
}) {
  const key = projectId ? `/api/chats?projectId=${encodeURIComponent(projectId)}` : "/api/chats";
  const { data, mutate } = useSWR<{ chats: ChatSummary[] }>(key, fetcher);
  const chats = data?.chats ?? [];
  const pinned = chats.filter((c) => c.isPinned);
  const rest = chats.filter((c) => !c.isPinned);

  async function togglePin(c: ChatSummary) {
    await fetch(`/api/chats/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: !c.isPinned }) });
    void mutate();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
      <div className="sidebar-header" style={{ paddingTop: 0 }}>
        <button type="button" className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => onNew?.()}>New chat</button>
      </div>
      <div className="chat-list">
        {pinned.length ? <div className="eyebrow" style={{ padding: "0 6px" }}>Pinned</div> : null}
        {pinned.map((c) => (
          <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
            <button type="button" onClick={() => onSelect?.(c.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: 0, cursor: "pointer", fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "Untitled"}</button>
            <button type="button" className="btn" style={{ padding: "2px 6px", fontSize: "0.68rem" }} onClick={() => void togglePin(c)}>{c.isPinned ? "Unpin" : "Pin"}</button>
          </div>
        ))}
        {rest.length ? <div className="eyebrow" style={{ padding: "0 6px", marginTop: 6 }}>Recent</div> : null}
        {rest.map((c) => (
          <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
            <button type="button" onClick={() => onSelect?.(c.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: 0, cursor: "pointer", fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "Untitled"}</button>
            <button type="button" className="btn" style={{ padding: "2px 6px", fontSize: "0.68rem" }} onClick={() => void togglePin(c)}>Pin</button>
          </div>
        ))}
        {chats.length === 0 ? <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 6px" }}>No chats yet.</div> : null}
      </div>
    </div>
  );
}
