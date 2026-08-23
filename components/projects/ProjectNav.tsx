"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Project } from "@/lib/types";
import { ProjectCard } from "./ProjectCard";
import { T3FolderNav } from "./T3FolderNav";
import { Folder, Plus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STORAGE_KEY = "openchat:sidebar-mode";
type SidebarMode = "normal" | "t3";

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
  const { data } = useSWR<{ projects: Project[] }>("/api/projects?limit=100", fetcher, {
    fallbackData: initial ? { projects: initial } : undefined,
  });
  const projects = data?.projects ?? initial ?? [];
  const { mutate: globalMutate } = useSWRConfig();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<SidebarMode>("normal");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as SidebarMode | null;
      if (raw === "normal" || raw === "t3") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(raw);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode, hydrated]);

  const q = filter?.trim() ?? "";
  const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) : projects;

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error("create failed");
      setTitle("");
      // refresh both SWR keys (/api/projects and /api/projects?limit=100) for Normal/T3 consistency
      void globalMutate((key) => typeof key === "string" && key.startsWith("/api/projects"));
      onCreated?.();
    } finally {
      setCreating(false);
    }
  }

  const toggle = (
    <div
      role="tablist"
      aria-label="Sidebar mode"
      style={{
        display: "flex",
        background: "var(--surface-muted)",
        padding: 4,
        borderRadius: 10,
        gap: 4,
        border: "1px solid var(--border-soft)",
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "normal"}
        onClick={() => setMode("normal")}
        style={{
          flex: 1,
          fontSize: "0.72rem",
          fontWeight: 600,
          padding: "6px 8px",
          borderRadius: 7,
          border: mode === "normal" ? "1px solid var(--border)" : "1px solid transparent",
          background: mode === "normal" ? "var(--surface)" : "transparent",
          color: mode === "normal" ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow: mode === "normal" ? "var(--shadow-sm)" : "none",
          cursor: "pointer",
          transition: "background 0.14s, color 0.14s, border-color 0.14s, box-shadow 0.14s",
        }}
      >
        Normal
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "t3"}
        onClick={() => setMode("t3")}
        style={{
          flex: 1,
          fontSize: "0.72rem",
          fontWeight: 600,
          padding: "6px 8px",
          borderRadius: 7,
          border: mode === "t3" ? "1px solid var(--border)" : "1px solid transparent",
          background: mode === "t3" ? "var(--surface)" : "transparent",
          color: mode === "t3" ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow: mode === "t3" ? "var(--shadow-sm)" : "none",
          cursor: "pointer",
          transition: "background 0.14s, color 0.14s, border-color 0.14s, box-shadow 0.14s",
        }}
      >
        T3 Code
      </button>
    </div>
  );

  if (mode === "t3") {
    return (
      <div className="project-nav" style={{ gap: 12, display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {toggle}
        <T3FolderNav projects={projects} activeId={activeId} onSelect={onSelect} onCreated={onCreated} filter={filter} />
      </div>
    );
  }

  // Normal mode — cleaned
  return (
    <div className="project-nav" style={{ gap: 12 }}>
      {toggle}

      <div className="project-nav-header" style={{ padding: 4 }}>
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Folder size={12} /> Projects
        </span>
        {projects.length > 0 ? (
          <span className="badge" style={{ fontSize: "0.65rem" }}>
            {projects.length}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 2px" }}>
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

      <div className="project-list" style={{ gap: 4 }}>
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
            <span
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              All / No project
            </span>
            <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-muted)" }}>Global chat</span>
          </span>
        </button>
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} active={p.id === activeId} onSelect={() => onSelect?.(p.id)} />
        ))}
        {filtered.length === 0 && q ? (
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 4px" }}>No projects match “{q}”.</div>
        ) : null}
        {filtered.length === 0 && !q ? (
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 4px", lineHeight: 1.4 }}>No projects yet. Create one above to organize chats.</div>
        ) : null}
      </div>
    </div>
  );
}
