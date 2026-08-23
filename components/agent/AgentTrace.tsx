"use client";

import { useState } from "react";
import type { ToolEvent } from "@/lib/types";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

export function AgentTrace({ trace }: { trace: ToolEvent[] }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!trace.length) return null;
  return (
    <div className="agent-trace">
      <button type="button" className="trace-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.8rem", fontWeight: 650 }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
            <Wrench size={12} />
          </span>
          Agent trace · {trace.length} steps
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <div className="trace-steps">
          {trace.map((step) => {
            const isOpen = expanded[step.id] ?? false;
            return (
              <div key={step.id} className="trace-step">
                <div className="trace-step-head">
                  <span className="trace-pill">{step.toolName}</span>
                  <span style={{ color: step.status === "ok" ? "var(--text-secondary)" : "var(--danger)", fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize" }}>{step.status}</span>
                  {step.latencyMs != null ? (
                    <span className="badge" style={{ fontSize: "0.66rem" }}>
                      {step.latencyMs}ms
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    style={{ marginLeft: "auto", padding: "3px 8px", fontSize: "0.7rem", borderRadius: 999 }}
                    onClick={() => setExpanded((p) => ({ ...p, [step.id]: !isOpen }))}
                  >
                    {isOpen ? "Collapse" : "Expand"}
                  </button>
                </div>
                {isOpen ? (
                  <div className="trace-io">
                    <div style={{ fontWeight: 650, marginBottom: 6, fontSize: "0.75rem", letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--text-muted)" }}>Input</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{format(step.input)}</pre>
                    <div style={{ fontWeight: 650, margin: "12px 0 6px", fontSize: "0.75rem", letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--text-muted)" }}>Output</div>
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
