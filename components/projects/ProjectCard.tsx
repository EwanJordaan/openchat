"use client";

import type { Project } from "@/lib/types";

export function ProjectCard({ project, active, onSelect }: { project: Project; active?: boolean; onSelect?: () => void }) {
  return (
    <button type="button" className={`project-card ${active ? "active" : ""}`} onClick={onSelect} aria-current={active ? "true" : undefined}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? "var(--accent)" : "var(--border)", flex: "0 0 auto" }} aria-hidden />
      <span style={{ minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.title}</span>
        <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.description ?? project.visibility}</span>
      </span>
    </button>
  );
}
