"use client";

import type { Project } from "@/lib/types";

export function ProjectCard({ project, active, onSelect }: { project: Project; active?: boolean; onSelect?: () => void }) {
  return (
    <button type="button" className={`project-card ${active ? "active" : ""}`} onClick={onSelect} aria-current={active ? "true" : undefined}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          background: active ? "var(--accent)" : "var(--surface-muted)",
          color: active ? "#fff" : "var(--text-muted)",
          display: "grid",
          placeItems: "center",
          fontSize: "0.72rem",
          fontWeight: 700,
          flex: "0 0 22px",
          border: active ? "0" : "1px solid var(--border)",
        }}
        aria-hidden
      >
        {project.title.slice(0, 1).toUpperCase()}
      </span>
      <span style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
        <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.title}</span>
        <span style={{ display: "block", fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {project.description ?? project.visibility}
        </span>
      </span>
      {active ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", flex: "0 0 6px" }} aria-hidden /> : null}
    </button>
  );
}
