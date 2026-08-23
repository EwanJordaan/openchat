"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Project, ChatSummary } from "@/lib/types";
import { Check, Edit3, MoreHorizontal, Plus, Trash2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── Color system ── */
export const PROJECT_COLORS = ["blue", "green", "purple", "orange", "red"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

const COLOR_MAP: Record<ProjectColor, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#8b5cf6",
  orange: "#f97316",
  red: "#ef4444",
};

function getProjectColor(project: Project): ProjectColor {
  const raw = (project as unknown as { color?: string }).color;
  if (raw && (PROJECT_COLORS as readonly string[]).includes(raw)) return raw as ProjectColor;
  if (typeof window !== "undefined") {
    try {
      const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
      const c = map[project.id];
      if (c && (PROJECT_COLORS as readonly string[]).includes(c)) return c as ProjectColor;
    } catch {}
  }
  return "blue";
}

function setProjectColor(projectId: string, color: string) {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
    map[projectId] = color;
    localStorage.setItem("openchat:project-colors", JSON.stringify(map));
  } catch {}
}

function getProjectColorClasses(color: ProjectColor): string {
  // Tailwind class helper, kept for spec parity; actual dot uses inline style via COLOR_MAP
  const map: Record<ProjectColor, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
  };
  return map[color];
}

/* ── Dialog primitives (minimal, T3-like) ── */
function DialogOverlay({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(4px)",
        zIndex: 60,
      }}
    />
  );
}

function DialogPanel({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <>
      <DialogOverlay onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 61,
          display: "grid",
          placeItems: "center",
          padding: 16,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(448px, 100%)",
            maxWidth: "28rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/* ── NewFolderButton + Dialog ── */
function NewFolderButton({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("blue");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, description: description.trim() || null }),
      });
      if (!res.ok) throw new Error("create failed");
      const j = (await res.json()) as { project: Project };
      if (j.project?.id) setProjectColor(j.project.id, color);
      setName("");
      setDescription("");
      setColor("blue");
      setOpen(false);
      onCreated?.();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="New folder"
        title="New folder"
        className="inline-flex items-center justify-center rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          color: "var(--text-muted)",
          flex: "0 0 24px",
        }}
      >
        <Plus size={16} />
      </button>
      {open ? (
        <DialogPanel title="New Folder" onClose={() => !saving && setOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>New Folder</h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>Create a folder to organize your chats.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>
              Name
              <input
                autoFocus
                placeholder="Folder name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) void handleCreate();
                  if (e.key === "Escape" && !saving) setOpen(false);
                }}
                maxLength={120}
                style={{
                  maxWidth: "50%",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  background: "var(--surface-elevated)",
                  color: "var(--text-primary)",
                  padding: "0.45rem 0.6rem",
                  fontSize: "0.85rem",
                  width: "100%",
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>
              Description
              <input
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) void handleCreate();
                }}
                maxLength={500}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  background: "var(--surface-elevated)",
                  color: "var(--text-primary)",
                  padding: "0.45rem 0.6rem",
                  fontSize: "0.85rem",
                  width: "100%",
                  outline: "none",
                }}
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>Color</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {PROJECT_COLORS.map((c) => {
                  const active = color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => setColor(c)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9999,
                        background: COLOR_MAP[c],
                        border: active ? "2px solid var(--text-primary)" : "2px solid transparent",
                        transform: active ? "scale(1.10)" : "scale(1)",
                        display: "grid",
                        placeItems: "center",
                        transition: "transform 0.14s, border-color 0.14s",
                        cursor: "pointer",
                        flex: "0 0 32px",
                      }}
                    >
                      {active ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void handleCreate()}
              disabled={saving || !name.trim()}
            >
              {saving ? "Creating…" : "Save"}
            </button>
          </div>
        </DialogPanel>
      ) : null}
    </>
  );
}

/* ── FolderItem ── */
function FolderItem({
  project,
  active,
  onSelect,
  numThreads,
  onUpdated,
  onDeleted,
}: {
  project: Project;
  active?: boolean;
  onSelect?: () => void;
  numThreads: number;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const [color, setColor] = useState<ProjectColor>("blue");
  // hydrate color after mount to avoid SSR mismatch (LS vs server default)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColor(getProjectColor(project));
  }, [project]);
  const dotBg = COLOR_MAP[color];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isMenuOpen]);

  const itemBg = active
    ? "color-mix(in srgb, var(--accent) 18%, var(--surface))"
    : isMenuOpen
      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
      : "transparent";

  return (
    <>
      {/* SidebarMenuItem > div group/item ... */}
      <div
        className="group/item flex w-full items-center rounded-sm"
        style={{
          background: itemBg,
          borderRadius: 6,
          minHeight: 30,
          padding: "2px 4px 2px 6px",
          gap: 6,
          transition: "background 0.14s",
        }}
        onMouseEnter={(e) => {
          if (!active && !isMenuOpen) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)";
        }}
        onMouseLeave={(e) => {
          if (!active && !isMenuOpen) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* SidebarMenuButton asChild flex-1 hover:bg-transparent > Link */}
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 hover:bg-transparent text-xs font-medium truncate flex items-center gap-2 text-left"
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: "6px 4px",
            borderRadius: 4,
            color: active ? "var(--text-primary)" : "var(--text-secondary)",
            fontSize: "0.82rem",
            fontWeight: 500,
            textAlign: "left" as const,
          }}
          title={project.title}
        >
          <span
            className={getProjectColorClasses(color)}
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: 9999,
              background: dotBg,
              flex: "0 0 12px",
              display: "inline-block",
            }}
          />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{project.title}</span>
        </button>

        {/* Right: DropdownMenu trigger */}
        <div ref={menuRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
          {/* count pill */}
          <span
            className="bg-input px-0.5 py-0.25 text-muted-foreground text-xs"
            style={{
              background: "var(--surface-muted)",
              padding: "1px 6px",
              borderRadius: 9999,
              fontSize: "0.70rem",
              color: "var(--text-muted)",
              border: "1px solid var(--border-soft)",
              opacity: isMenuOpen ? 0 : 1,
              transition: "opacity 0.14s",
              display: numThreads > 0 ? "inline-flex" : "none",
              alignItems: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {numThreads}
          </span>

          <button
            type="button"
            aria-label="Folder actions"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((v) => !v)}
            className="rounded p-1 hover:bg-accent/50"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              display: "grid",
              placeItems: "center",
              color: "var(--text-muted)",
              border: 0,
              background: isMenuOpen ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
              opacity: isMenuOpen ? 1 : 0,
              transition: "opacity 0.14s, background 0.14s",
              cursor: "pointer",
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          {/* Dropdown content */}
          {isMenuOpen ? (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: 160,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                boxShadow: "var(--shadow-lg)",
                padding: 4,
                zIndex: 30,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                  setEditOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: 0,
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Edit3 size={14} /> Edit folder
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                  setDeleteOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: 0,
                  background: "transparent",
                  color: "var(--danger)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--danger) 10%, transparent)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Trash2 size={14} /> Delete folder
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editOpen ? (
        <EditFolderDialog project={project} initialColor={color} onClose={() => setEditOpen(false)} onUpdated={onUpdated} />
      ) : null}

      {deleteOpen ? (
        <DeleteFolderDialog project={project} numThreads={numThreads} onClose={() => setDeleteOpen(false)} onDeleted={onDeleted} />
      ) : null}
    </>
  );
}

function EditFolderDialog({
  project,
  initialColor,
  onClose,
  onUpdated,
}: {
  project: Project;
  initialColor: ProjectColor;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [name, setName] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState<ProjectColor>(initialColor);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, description: description.trim() || null }),
      });
      if (!res.ok) throw new Error("update failed");
      setProjectColor(project.id, color);
      onClose();
      onUpdated?.();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogPanel title="Edit Folder" onClose={() => !saving && onClose()}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Edit Folder</h2>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>Update folder details.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) void handleSave();
              if (e.key === "Escape" && !saving) onClose();
            }}
            maxLength={120}
            style={{
              maxWidth: "50%",
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "var(--surface-elevated)",
              color: "var(--text-primary)",
              padding: "0.45rem 0.6rem",
              fontSize: "0.85rem",
              width: "100%",
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) void handleSave();
            }}
            maxLength={500}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "var(--surface-elevated)",
              color: "var(--text-primary)",
              padding: "0.45rem 0.6rem",
              fontSize: "0.85rem",
              width: "100%",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)" }}>Color</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {PROJECT_COLORS.map((c) => {
              const active = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9999,
                    background: COLOR_MAP[c],
                    border: active ? "2px solid var(--text-primary)" : "2px solid transparent",
                    transform: active ? "scale(1.10)" : "scale(1)",
                    display: "grid",
                    placeItems: "center",
                    transition: "transform 0.14s, border-color 0.14s",
                    cursor: "pointer",
                    flex: "0 0 32px",
                  }}
                >
                  {active ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </DialogPanel>
  );
}

function DeleteFolderDialog({
  project,
  numThreads,
  onClose,
  onDeleted,
}: {
  project: Project;
  numThreads: number;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      try {
        const map = JSON.parse(localStorage.getItem("openchat:project-colors") || "{}") as Record<string, string>;
        delete map[project.id];
        localStorage.setItem("openchat:project-colors", JSON.stringify(map));
      } catch {}
      onClose();
      onDeleted?.();
    } catch {
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DialogOverlay onClick={() => !deleting && onClose()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete folder"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 62,
          display: "grid",
          placeItems: "center",
          padding: 16,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(448px, 100%)",
            maxWidth: "28rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Are you sure you want to delete this folder?</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
              This action cannot be undone. This will permanently delete the folder <strong style={{ color: "var(--text-primary)" }}>{project.title}</strong>
              {numThreads > 0
                ? ` and archive its ${numThreads} ${numThreads === 1 ? "thread" : "threads"}. Threads will be archived, not deleted.`
                : " and archive its threads."}
            </p>
            {numThreads > 0 ? (
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
                Folder contains <strong style={{ color: "var(--text-primary)" }}>{numThreads}</strong> {numThreads === 1 ? "thread" : "threads"}.
              </p>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={deleting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete folder"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main T3FolderNav ── */
export function T3FolderNav({
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
  const { data, mutate } = useSWR<{ projects: Project[] }>("/api/projects?limit=100", fetcher, {
    fallbackData: initial ? { projects: initial } : undefined,
  });
  const projects = data?.projects ?? initial ?? [];

  const { data: chatsData } = useSWR<{ chats: ChatSummary[] }>("/api/chats", fetcher);
  const chats = chatsData?.chats ?? [];

  const q = filter?.trim() ?? "";
  const filtered = q ? projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) : projects;

  const countByProject = new Map<string, number>();
  for (const c of chats) {
    if (c.projectId) countByProject.set(c.projectId, (countByProject.get(c.projectId) ?? 0) + 1);
  }

  const { mutate: globalMutate } = useSWRConfig();
  function handleMutate() {
    void mutate();
    void globalMutate((key) => typeof key === "string" && key.startsWith("/api/projects"));
    void globalMutate((key) => typeof key === "string" && key.startsWith("/api/chats"));
    onCreated?.();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 8px 0 8px",
        overflow: "hidden",
        minHeight: 0,
        flex: 1,
      }}
    >
      {/* SidebarGroup > SidebarGroupLabel pr-0 flex */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 8,
          paddingRight: 0,
          height: 28,
          minHeight: 28,
        }}
      >
        <span
          className="text-xs font-medium"
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Folders
        </span>
        <NewFolderButton onCreated={handleMutate} />
      </div>

      {/* SidebarGroupContent > SidebarMenu */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
          scrollbarWidth: "none",
          paddingRight: 2,
          minHeight: 0,
          flex: 1,
        }}
      >
        {filtered.map((p) => (
          <FolderItem
            key={p.id}
            project={p}
            active={p.id === activeId}
            onSelect={() => onSelect?.(p.id)}
            numThreads={countByProject.get(p.id) ?? 0}
            onUpdated={handleMutate}
            onDeleted={handleMutate}
          />
        ))}
        {filtered.length === 0 && q ? (
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 6px" }}>No folders match “{q}”.</div>
        ) : null}
        {filtered.length === 0 && !q ? (
          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", padding: "8px 6px", lineHeight: 1.4 }}>
            No folders yet. Create one to organize chats.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default T3FolderNav;
