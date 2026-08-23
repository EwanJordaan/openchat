/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import type { Citation, Document, Project } from "@/lib/types";
import { ProjectNav } from "@/components/projects/ProjectNav";
import { ChatList } from "@/components/chat/ChatList";
import { MessageStream } from "@/components/chat/MessageStream";
import { AgentTrace } from "@/components/agent/AgentTrace";
import { DocViewer } from "@/components/docs/DocViewer";
import { IngestDropzone } from "@/components/docs/IngestDropzone";
import { Composer } from "@/components/composer/Composer";
import { useChat } from "@/lib/hooks/useChat";
import { useTheme } from "@/components/providers/theme-provider";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function WorkspaceShell({
  projects: initialProjects,
  initialProjectId,
  initialChatId,
}: {
  projects?: Project[];
  initialProjectId?: string | null;
  initialChatId?: string | null;
}) {
  const { data: projData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>("/api/projects", fetcher, {
    fallbackData: initialProjects ? { projects: initialProjects } : undefined,
  });
  const projects = projData?.projects ?? initialProjects ?? [];
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId ?? projects[0]?.id ?? null);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId ?? null);
  const [draft, setDraft] = useState("");
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId]);

  const { messages, isStreaming, trace, send, stop } = useChat({ projectId: activeProjectId, chatId: activeChatId ?? undefined });

  const onCitation = useCallback(
    async (c: Citation) => {
      setHighlight(c.excerpt ?? null);
      setDrawerOpen(true);
      try {
        const res = await fetch(`/api/docs/${c.documentId}`);
        if (res.ok) {
          const j = (await res.json()) as { document: Document };
          if (j.document) {
            setActiveDoc(j.document);
            return;
          }
        }
      } catch {}
      setActiveDoc({
        id: c.documentId,
        projectId: activeProjectId,
        ownerUserId: null,
        guestId: null,
        title: c.title ?? c.documentId,
        sourceType: "file",
        sourceUrl: null,
        mimeType: null,
        storageKey: null,
        sha256: null,
        pageCount: null,
        tokenCount: null,
        status: "ready",
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    [activeProjectId],
  );

  const handleSend = useCallback(
    (text: string, opts: { preset?: string }) => {
      void send(text, { preset: opts.preset as never });
      setDraft("");
    },
    [send],
  );

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="workspace-shell">
      {/* mobile backdrop */}
      {mobileNavOpen ? <button type="button" aria-label="Close sidebar" className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} /> : null}

      {/* ── Sidebar — T3 / ChatGPT style ── */}
      <aside className={`chat-sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-mark">◐</div>
          <div className="brand-text">
            <span className="brand-title">OpenChat</span>
            <span className="brand-sub">Agentic workspace</span>
          </div>
          <button
            type="button"
            className="btn btn-icon ghost"
            style={{ marginLeft: "auto" }}
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close"
          >
            <span style={{ fontSize: 14 }}>✕</span>
          </button>
        </div>

        <div style={{ padding: "12px 10px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="new-chat-btn" onClick={() => setActiveChatId(null)}>
            <span style={{ fontSize: 16 }}>＋</span> New chat
          </button>

          <label className="sidebar-search" aria-label="Search">
            <span aria-hidden style={{ color: "var(--text-muted)", fontSize: 13 }}>⌕</span>
            <input
              className="sidebar-search-input"
              placeholder="Search chats & projects"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </label>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ProjectNav
            projects={projects}
            activeId={activeProjectId}
            onSelect={(id) => {
              setActiveProjectId(id);
              setMobileNavOpen(false);
            }}
            onCreated={() => void mutateProjects()}
            filter={searchQ}
          />
          <div style={{ padding: "8px 10px 10px" }}>
            {activeProjectId ? <IngestDropzone projectId={activeProjectId} onComplete={() => void mutateProjects()} /> : null}
          </div>
          <ChatList
            projectId={activeProjectId}
            activeId={activeChatId}
            filter={searchQ}
            onSelect={(id) => {
              setActiveChatId(id);
              setMobileNavOpen(false);
            }}
            onNew={() => {
              setActiveChatId(null);
              setMobileNavOpen(false);
            }}
          />
        </div>

        <div className="sidebar-footer">
          <a className="btn ghost" href="/signin" style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}>
            Sign in
          </a>
          <a className="btn primary" href="/signup" style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}>
            Sign up
          </a>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="chat-main">
        {/* Top bar — ChatGPT centered model pill */}
        <div className="chat-main-header">
          <button
            type="button"
            className="btn btn-icon"
            style={{ display: "inline-flex" }}
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            ☰
          </button>

          <div className="topbar-center">
            <button type="button" className="model-selector-pill" title={activeProject?.title ?? "Select project"}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: activeProject ? "var(--accent)" : "var(--text-muted)",
                  display: "inline-block",
                }}
                aria-hidden
              />
              <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeProject?.title ?? "Select project"}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>▾</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="badge" style={{ display: messages.length ? "inline-flex" : "none" }}>
              {messages.length}
            </span>
            {activeDoc ? (
              <button type="button" className="btn btn-sm" onClick={() => setDrawerOpen((v) => !v)}>
                {drawerOpen ? "Hide docs" : "View doc"}
              </button>
            ) : null}
            <ThemeToggle />
          </div>
        </div>

        <div className="chat-stage">
          <MessageStream messages={messages} onCitationClick={onCitation} onPromptClick={(prompt) => setDraft(prompt)} />
          <AgentTrace trace={trace} />
          <Composer
            draft={draft}
            setDraft={setDraft}
            onSend={handleSend}
            onStop={stop}
            isStreaming={isStreaming}
            projectId={activeProjectId}
          />
        </div>
      </div>

      {/* ── Doc pane — desktop inline, mobile drawer ── */}
      {activeDoc ? (
        <>
          {/* desktop persistent pane */}
          <div className="doc-viewer-pane" style={{ display: drawerOpen ? undefined : "none" }}>
            <DocViewer document={activeDoc} highlightedChunk={highlight} onClose={() => setDrawerOpen(false)} />
          </div>

          {/* mobile / overlay drawer when pane hidden on <=1100 */}
          {drawerOpen ? (
            <div className="doc-drawer" style={{ display: "none" }} data-drawer>
              {/* JS will toggle via CSS media — fallback render hidden, but we also show overlay drawer via portal-like conditional */}
            </div>
          ) : null}
        </>
      ) : null}

      {/* actual overlay drawer for small screens */}
      {activeDoc && drawerOpen ? (
        <div className="doc-drawer" style={{ ["--show" as string]: "1" } as React.CSSProperties}>
          <button type="button" className="doc-drawer-backdrop" aria-label="Close document" onClick={() => setDrawerOpen(false)} style={{ position: "absolute", inset: 0 }} />
          <div className="doc-drawer-panel" style={{ position: "relative", marginLeft: "auto" }}>
            <DocViewer document={activeDoc} highlightedChunk={highlight} onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <style>{`
        @media (min-width: 1101px) { .doc-drawer { display: none !important; } }
        @media (max-width: 1100px) {
          .doc-viewer-pane { display: none !important; }
          .doc-drawer { display: grid !important; }
        }
        @media (min-width: 761px) { .chat-main-header .btn[aria-label="Toggle menu"] { display: none !important; } }
        @media (max-width: 760px) { .sidebar-brand .btn[aria-label="Close"] { display: inline-flex; } }
        @media (min-width: 761px) { .sidebar-brand .btn[aria-label="Close"] { display: none !important; } }
      `}</style>
    </div>
  );
}

function ThemeToggle() {
  const t = useTheme();
  return (
    <button
      type="button"
      className="btn btn-icon"
      aria-label="Toggle theme"
      title={`Theme: ${t.resolvedTheme}`}
      onClick={() => t.setMode(t.resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span style={{ fontSize: 14 }}>{t.resolvedTheme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

export default WorkspaceShell;
