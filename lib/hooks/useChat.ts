"use client";

import { useCallback, useRef, useState } from "react";
import type { Citation, ChatMessage, ToolEvent } from "@/lib/types";
import { readSseStream, tryParseJson } from "@/lib/chat/sse";

export interface UseChatOptions {
  chatId?: string;
  projectId?: string | null;
  initialMessages?: ChatMessage[];
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  trace: ToolEvent[];
  citations: Citation[];
  send: (text: string, opts?: { modelId?: string; preset?: string }) => Promise<void>;
  stop: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat(opts: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [trace, setTrace] = useState<ToolEvent[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string, sendOpts?: { modelId?: string; preset?: string }) => {
      if (!text.trim() || isStreaming) return;
      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: uid("msg"),
        chatId: opts.chatId ?? uid("chat"),
        role: "user",
        content: text,
        modelId: sendOpts?.modelId ?? "gpt-4o-mini",
        createdAt: now,
        attachments: [],
      };
      const assistantId = uid("assistant-stream");
      const assistantMsg: ChatMessage = {
        id: assistantId,
        chatId: userMsg.chatId,
        role: "assistant",
        content: "",
        modelId: userMsg.modelId,
        createdAt: now,
        attachments: [],
        citations: [],
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setTrace([]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            chatId: opts.chatId,
            projectId: opts.projectId ?? null,
            preset: sendOpts?.preset,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "request failed");
          throw new Error(errText || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        let acc = "";
        for await (const ev of readSseStream(reader)) {
          if (controller.signal.aborted) break;
          const data = tryParseJson<Record<string, unknown>>(ev.data, {});
          if (ev.event === "token") {
            const delta = (data["text"] as string) ?? (data["token"] as string) ?? "";
            if (delta) {
              acc += delta;
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
            }
          } else if (ev.event === "tool_call") {
            const t: ToolEvent = {
              id: String(data["id"] ?? uid("tool")),
              chatId: userMsg.chatId,
              messageId: assistantId,
              toolName: String(data["name"] ?? "tool"),
              input: data["input"] ?? data,
              output: null,
              status: "ok",
              latencyMs: null,
              createdAt: new Date().toISOString(),
            };
            setTrace((prev) => [...prev, t]);
          } else if (ev.event === "tool_result") {
            setTrace((prev) =>
              prev.map((t) =>
                t.id === String(data["id"])
                  ? { ...t, output: data["output"] ?? data, status: (data["ok"] as string) === "false" ? "error" : "ok", latencyMs: (data["latencyMs"] as number) ?? t.latencyMs }
                  : t,
              ),
            );
          } else if (ev.event === "citations") {
            const cites = (data["citations"] as Citation[]) ?? [];
            setCitations(cites);
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, citations: cites } : m)));
          } else if (ev.event === "done") {
            const finalCites = (data["citations"] as Citation[]) ?? citesFromCitations(citations);
            if (finalCites.length) {
              setCitations(finalCites);
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, citations: finalCites } : m)));
            }
            break;
          } else if (ev.event === "error") {
            const msg = String(data["message"] ?? "error");
            acc += `\n\n[error: ${msg}]`;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
            break;
          }
        }
        // finalize id if needed
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, id: uid("msg") } : m)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("abort")) return;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + `\n\n[failed: ${msg}]` } : m)));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, opts.chatId, opts.projectId, citations],
  );

  return { messages, isStreaming, trace, citations, send, stop, setMessages };
}

function citesFromCitations(c: Citation[]): Citation[] {
  return c;
}
