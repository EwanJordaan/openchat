import type { Actor, AgentPreset } from "@/lib/types";
import { getLlm, streamLlm } from "@/lib/llm/provider";
import { retrieve, buildGroundingBlock, type RetrievedChunk } from "@/lib/agent/retrieval";
import { executeTool, getToolsForLlm } from "@/lib/agent/registry";
import { compressMessages } from "@/lib/agent/memory";
import { plan } from "@/lib/agent/planner";

export interface AgentContext {
  chatId?: string;
  projectId?: string | null;
  actor: Actor;
  signal?: AbortSignal;
  preset?: AgentPreset;
}

export type AgentEvent =
  | { type: "meta"; data: unknown }
  | { type: "token"; data: { text: string } }
  | { type: "tool_call"; data: { id: string; name: string; input: unknown } }
  | { type: "tool_result"; data: { id: string; name: string; output: string; error?: string; ok: boolean; latencyMs?: number } }
  | { type: "citations"; data: { citations: unknown[] } }
  | { type: "done"; data: unknown }
  | { type: "error"; data: { message: string } };

export function buildSystemPrompt(
  presetOrOpts?: string | null | { preset?: string | null; retrievedCount?: number },
  retrievedCountArg?: number,
): string {
  const preset = typeof presetOrOpts === "object" && presetOrOpts !== null ? presetOrOpts.preset : presetOrOpts;
  const retrievedCount =
    typeof presetOrOpts === "object" && presetOrOpts !== null && "retrievedCount" in presetOrOpts
      ? presetOrOpts.retrievedCount
      : retrievedCountArg;
  const base = `You are OpenChat, a doc-native agentic assistant. Ground every factual answer in cited chunks. If sources are insufficient, say so.`;
  const groundingNote =
    retrievedCount && retrievedCount > 0
      ? ` You have ${retrievedCount} grounding chunks in <grounding>. Cite as [Doc: title pN].`
      : ` No grounding chunks were found for this query; answer from general knowledge and note the lack of sources.`;

  switch (preset) {
    case "research":
      return `${base} Preset: Researcher — be thorough, compare sources, show reasoning, cite every claim.${groundingNote}`;
    case "analyst":
      return `${base} Preset: Analyst — focus on numbers, tables, risks, structured insight. Cite data points.${groundingNote}`;
    case "builder":
      return `${base} Preset: Builder — prefer actionable steps, code, and creation. Cite when referencing docs.${groundingNote}`;
    default:
      return `${base}${groundingNote}`;
  }
}

function lastUserContent(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1]?.content ?? "";
}

type LlmMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
};

export async function* runAgent(opts: {
  messages: LlmMessage[];
  context: AgentContext;
  projectId?: string | null;
  onEvent?: (e: AgentEvent) => void;
}): AsyncGenerator<AgentEvent> {
  const projectId = opts.projectId ?? opts.context.projectId ?? null;
  const messages: LlmMessage[] = compressMessages([...opts.messages] as unknown as Array<{ role: string; content: string }>) as unknown as LlmMessage[];
  const maxTurns = 12;
  const query = lastUserContent(messages);

  let subTasks: string[] = [];
  try {
    const p = await plan({ query });
    subTasks = p.subTasks;
  } catch {
    subTasks = [query];
  }

  const metaEvent: AgentEvent = { type: "meta", data: { projectId, chatId: opts.context.chatId, subTasks } };
  if (opts.onEvent) opts.onEvent(metaEvent);
  yield metaEvent;

  let retrieved: RetrievedChunk[] = [];
  try {
    retrieved = await retrieve({ query, projectId: projectId ?? undefined, topK: 12 });
  } catch {
    retrieved = [];
  }

  const citations = retrieved.map((c) => ({
    chunkId: c.chunkId,
    documentId: c.documentId,
    title: c.title,
    page: c.page,
    score: c.score,
  }));

  const citEvent: AgentEvent = { type: "citations", data: { citations } };
  if (opts.onEvent) opts.onEvent(citEvent);
  yield citEvent;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.context.signal?.aborted) {
      const ev: AgentEvent = { type: "error", data: { message: "aborted" } };
      if (opts.onEvent) opts.onEvent(ev);
      yield ev;
      return;
    }

    const grounding = buildGroundingBlock(retrieved);
    const systemPrompt = buildSystemPrompt(opts.context.preset, retrieved.length);

    const modelId = "gpt-4o-mini";
    const llmModel = getLlm(modelId);
    if (!llmModel) {
      const demoText =
        retrieved.length > 0
          ? `Demo mode — no LLM key configured. Returning grounded context for "${query.slice(0, 80)}":\n\n${grounding.slice(0, 1200)}`
          : `Demo mode — no LLM key configured. No grounded chunks found for "${query.slice(0, 80)}". This is a stub response.`;
      const ev: AgentEvent = { type: "token", data: { text: demoText } };
      if (opts.onEvent) opts.onEvent(ev);
      yield ev;
      const done: AgentEvent = { type: "done", data: { citations, demo: true } };
      if (opts.onEvent) opts.onEvent(done);
      yield done;
      return;
    }

    const tools = getToolsForLlm();

    const stream = streamLlm({
      model: llmModel,
      messages,
      tools,
      systemPrompt,
      signal: opts.context.signal,
    });

    if (!stream) {
      const ev: AgentEvent = { type: "error", data: { message: "LLM unavailable (missing credentials)" } };
      if (opts.onEvent) opts.onEvent(ev);
      yield ev;
      return;
    }

    let textAccum = "";
    const toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = [];

    try {
      const fullStream = (stream as unknown as { fullStream: AsyncIterable<unknown> }).fullStream;
      for await (const part of fullStream) {
        if (opts.context.signal?.aborted) break;
        const p = part as Record<string, unknown>;
        const t = p["type"] as string | undefined;
        if (t === "text-delta") {
          const delta = (p["textDelta"] as string) ?? (p["text"] as string) ?? "";
          if (delta) {
            textAccum += delta;
            const ev: AgentEvent = { type: "token", data: { text: delta } };
            if (opts.onEvent) opts.onEvent(ev);
            yield ev;
          }
        } else if (t === "tool-call") {
          const toolCallId = (p["toolCallId"] as string) ?? `tool_${toolCalls.length}`;
          const toolName = (p["toolName"] as string) ?? "unknown";
          const args = p["args"] ?? p["input"] ?? {};
          toolCalls.push({ toolCallId, toolName, args });
          const ev: AgentEvent = { type: "tool_call", data: { id: toolCallId, name: toolName, input: args } };
          if (opts.onEvent) opts.onEvent(ev);
          yield ev;
        } else if (t === "error") {
          const msg = (p["error"] as string) ?? "stream error";
          const ev: AgentEvent = { type: "error", data: { message: String(msg) } };
          if (opts.onEvent) opts.onEvent(ev);
          yield ev;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const ev: AgentEvent = { type: "error", data: { message: msg } };
      if (opts.onEvent) opts.onEvent(ev);
      yield ev;
      return;
    }

    if (toolCalls.length === 0) {
      const done: AgentEvent = { type: "done", data: { text: textAccum, citations } };
      if (opts.onEvent) opts.onEvent(done);
      yield done;
      return;
    }

    messages.push({
      role: "assistant",
      content: textAccum || "",
      toolCalls: toolCalls.map((c) => ({ id: c.toolCallId, name: c.toolName, input: c.args })),
    });

    for (const tc of toolCalls) {
      const start = Date.now();
      const result = await executeTool(tc.toolName, tc.args, opts.context as unknown as import("@/lib/agent/types").AgentContext);
      const latency = Date.now() - start;
      const ev: AgentEvent = {
        type: "tool_result",
        data: { id: tc.toolCallId, name: tc.toolName, output: result.output, error: result.error, ok: result.ok, latencyMs: latency },
      };
      if (opts.onEvent) opts.onEvent(ev);
      yield ev;

      messages.push({
        role: "tool",
        content: result.ok ? result.output : `Error: ${result.error ?? "unknown"}`,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
      });
    }

    try {
      retrieved = await retrieve({ query, projectId: projectId ?? undefined, topK: 12 });
    } catch {
      // keep previous
    }
  }

  const done: AgentEvent = { type: "done", data: { citations: retrieved.map((c) => ({ chunkId: c.chunkId, documentId: c.documentId, title: c.title, page: c.page })) } };
  if (opts.onEvent) opts.onEvent(done);
  yield done;
}
