"use client";

import { useState } from "react";
import type { ToolEvent } from "@/lib/types";

export function AgentTrace({ trace }: { trace: ToolEvent[] }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!trace.length) return null;
  return (
    <div className="agent-trace">
      <button type="button" className="trace-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>Agent trace · {trace.length} steps</span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="trace-steps">
          {trace.map((step) => {
            const isOpen = expanded[step.id] ?? false;
            return (
              <div key={step.id} className="trace-step">
                <div className="trace-step-head">
                  <span className="trace-pill">{step.toolName}</span>
                  <span style={{ color: step.status === "ok" ? "var(--text-secondary)" : "var(--danger)", fontSize: "0.72rem" }}>{step.status}</span>
                  {step.latencyMs != null ? <span className="badge">{step.latencyMs}ms</span> : null}
                  <button type="button" className="btn" style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "0.7rem" }} onClick={() => setExpanded((p) => ({ ...p, [step.id]: !isOpen }))}>
                    {isOpen ? "Collapse" : "Expand"}
                  </button>
                </div>
                {isOpen ? (
                  <div className="trace-io">
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Input</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{format(step.input)}</pre>
                    <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>Output</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{format(step.output)}</pre>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function format(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
