"use client";

import { useState } from "react";
import useSWR from "swr";
import type { Project } from "@/lib/types";
import { ProjectCard } from "./ProjectCard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ProjectNav({
  projects: initial,
  activeId,
  onSelect,
  onCreated,
}: {
  projects?: Project[];
  activeId?: string | null;
  onSelect?: (id: string | null) => void;
  onCreated?: () => void;
}) {
  const { data } = useSWR<{ projects: Project[] }>("/api/projects?limit=100", fetcher, { fallbackData: initial ? { projects: initial } : undefined });
  const projects = data?.projects ?? initial ?? [];
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
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
        <span className="eyebrow">Projects</span>
        <span className="badge">{projects.length}</span>
      </div>
      <div className="sidebar-search" style={{ flex: "0 0 auto" }}>
        <input className="sidebar-search-input" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input className="sidebar-search-input" placeholder="New project title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", flex: 1 }} />
        <button type="button" className="btn primary" disabled={creating || !title.trim()} onClick={() => void create()}>Create</button>
      </div>
      <div className="project-list">
        <button type="button" className={`project-card ${!activeId ? "active" : ""}`} onClick={() => onSelect?.(null)}>All / No project</button>
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} active={p.id === activeId} onSelect={() => onSelect?.(p.id)} />
        ))}
        {filtered.length === 0 ? <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 4px" }}>No projects.</div> : null}
      </div>
    </div>
  );
}
