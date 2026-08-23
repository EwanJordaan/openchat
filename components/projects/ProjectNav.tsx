"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./ProjectCard";
import { T3FolderNav } from "./T3FolderNav";
import { Folder, MessageSquare, Plus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STORAGE_KEY = "openchat:sidebar-mode";
type SidebarMode = "normal" | "folders";

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
      const raw = localStorage.getItem(STORAGE_KEY) as string | null;
      if (raw === "normal" || raw === "folders" || raw === "t3") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(raw === "t3" ? "folders" : (raw as SidebarMode));
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
      void globalMutate((key) => typeof key === "string" && key.startsWith("/api/projects"));
      onCreated?.();
    } finally {
      setCreating(false);
    }
  }

  // ChatGPT-style Work toggle: pill segmented, icons, muted background
  const toggle = (
    <div
      role="tablist"
      aria-label="Sidebar mode"
      className="flex items-center gap-1 rounded-full bg-muted p-1 border"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "normal"}
        onClick={() => setMode("normal")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
          mode === "normal"
            ? "bg-background text-foreground shadow-sm border"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "folders"}
        onClick={() => setMode("folders")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
          mode === "folders"
            ? "bg-background text-foreground shadow-sm border"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Folder className="h-3.5 w-3.5" />
        Folders
      </button>
    </div>
  );

  if (mode === "folders") {
    return (
      <div className="project-nav flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {toggle}
        <T3FolderNav projects={projects} activeId={activeId} onSelect={onSelect} onCreated={onCreated} filter={filter} />
      </div>
    );
  }

  // Normal mode — simple clean Projects UI
  return (
    <div className="project-nav gap-3">
      {toggle}

      <div className="project-nav-header" style={{ padding: 4 }}>
        <span className="eyebrow inline-flex items-center gap-1.5">
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
