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
  const { data: projData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>("/api/projects", fetcher, { fallbackData: initialProjects ? { projects: initialProjects } : undefined });
  const projects = projData?.projects ?? initialProjects ?? [];
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId ?? projects[0]?.id ?? null);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId ?? null);
  const [draft, setDraft] = useState("");
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId]);

  const { messages, isStreaming, trace, send, stop } = useChat({ projectId: activeProjectId, chatId: activeChatId ?? undefined });

  const onCitation = useCallback(
    async (c: Citation) => {
      setHighlight(c.excerpt ?? null);
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
      // fallback stub
      setActiveDoc({ id: c.documentId, projectId: activeProjectId, ownerUserId: null, guestId: null, title: c.title ?? c.documentId, sourceType: "file", sourceUrl: null, mimeType: null, storageKey: null, sha256: null, pageCount: null, tokenCount: null, status: "ready", error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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

  return (
    <div className="workspace-shell">
      <aside className="chat-sidebar" style={{ borderRight: "1px solid var(--border)" }}>
        <ProjectNav projects={projects} activeId={activeProjectId} onSelect={setActiveProjectId} onCreated={() => void mutateProjects()} />
        <div style={{ padding: "0 10px 10px" }}>{activeProjectId ? <IngestDropzone projectId={activeProjectId} onComplete={() => void mutateProjects()} /> : null}</div>
        <ChatList projectId={activeProjectId} activeId={activeChatId} onSelect={setActiveChatId} onNew={() => setActiveChatId(null)} />
        <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
          <a className="btn" href="/signin" style={{ flex: 1, justifyContent: "center" }}>Sign in</a>
          <a className="btn" href="/signup" style={{ flex: 1, justifyContent: "center" }}>Sign up</a>
        </div>
      </aside>

      <div className="chat-main">
        <div className="chat-main-header">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Workspace</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{projects.find((p) => p.id === activeProjectId)?.title ?? "Select project"}</div>
          </div>
          <span className="badge">{messages.length} messages</span>
        </div>
        <div className="chat-stage" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "transparent" }}>
          <div className="chat-card">
            <MessageStream messages={messages} onCitationClick={onCitation} />
            <AgentTrace trace={trace} />
            <Composer draft={draft} setDraft={setDraft} onSend={handleSend} onStop={stop} isStreaming={isStreaming} projectId={activeProjectId} />
          </div>
        </div>
      </div>

      <div className="doc-viewer-pane" style={{ minWidth: 0, height: "100%", overflow: "hidden" }}>
        <DocViewer document={activeDoc} highlightedChunk={highlight} />
      </div>
    </div>
  );
}

export default WorkspaceShell;
