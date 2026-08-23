"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Project } from "@/lib/types";
import { ProjectCard } from "./ProjectCard";
import { Folder, Plus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ProjectNav({
  projects: initial,
  activeId,
  onSelect,
  onCreated,
  filter,
}: {
  projects?: Project[];
  activeId?: string | null;
  onSelect?: (id: string | null) => void;
  onCreated?: () => void;
  filter?: string;
}) {
  const { data } = useSWR<{ projects: Project[] }>("/api/projects?limit=100", fetcher, { fallbackData: initial ? { projects: initial } : undefined });
  const projects = data?.projects ?? initial ?? [];
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const q = filter ?? "";
  const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) : projects;

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
      if (!res.ok) throw new Error("create failed");
      setTitle("");
      onCreated?.();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="project-nav">
      <div className="project-nav-header">
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Folder size={12} /> Projects
        </span>
        <span className="badge" style={{ fontSize: "0.65rem" }}>
          {projects.length}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="New project title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "7px 10px",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontSize: "0.82rem",
            outline: "none",
          }}
        />
        <button
          type="button"
          className="btn primary btn-icon"
          disabled={creating || !title.trim()}
          onClick={() => void create()}
          aria-label="Create project"
          title="Create project"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="project-list">
        <button type="button" className={`project-card ${!activeId ? "active" : ""}`} onClick={() => onSelect?.(null)}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: !activeId ? "var(--accent-soft)" : "var(--surface-muted)",
              color: !activeId ? "var(--accent)" : "var(--text-muted)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 22px",
            }}
            aria-hidden
          >
            ⊞
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>All / No project</span>
            <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-muted)" }}>Global chat</span>
          </span>
        </button>
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} active={p.id === activeId} onSelect={() => onSelect?.(p.id)} />
        ))}
        {filtered.length === 0 ? <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 4px" }}>No projects match “{q}”.</div> : null}
      </div>
    </div>
  );
}
