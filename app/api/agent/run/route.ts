import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import {
  appendMessage,
  appendToolEvent,
  createChat,
  getChat,
  getChatMessages,
  getPublicAppSettings,
  listModelsForActor,
  logAudit,
} from "@/lib/db/store";
import { invalidateChatListCache } from "@/lib/cache/chat-cache";
import { runAgent } from "@/lib/agent/run";
import { createId } from "@/lib/utils";
import { attachActorCookies, jsonError } from "@/lib/http";

const bodySchema = z.object({
  chatId: z.string().min(2).max(80).optional().nullable(),
  projectId: z.string().min(2).max(80).optional().nullable(),
  message: z.string().min(1).max(20000),
  mentionDocIds: z.array(z.string()).optional(),
  agentPreset: z.enum(["research", "analyst", "builder"]).optional().nullable(),
  modelId: z.string().min(2).max(80).optional().nullable(),
});

export async function POST(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const traceId = createId("trc");

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), { actor, needsGuestCookie, needsSessionCleanup });
    body = parsed.data;
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }

  const message = body.message.trim();
  if (!message) return attachActorCookies(jsonError("Message required", 400), { actor, needsGuestCookie, needsSessionCleanup });

  const settings = await getPublicAppSettings();
  if (actor.type === "guest" && !settings.guestEnabled) {
    return attachActorCookies(jsonError("Guest chatting is disabled", 403), { actor, needsGuestCookie, needsSessionCleanup });
  }

  const models = await listModelsForActor(actor);
  const requestedModel = body.modelId?.trim() || settings.defaultModelId;
  const model = models.find((m) => m.id === requestedModel) ?? models.find((m) => m.isDefault) ?? models[0];
  if (!model) return attachActorCookies(jsonError("No model available", 503), { actor, needsGuestCookie, needsSessionCleanup });

  let chatId = body.chatId?.trim() || null;
  let projectId: string | null = body.projectId?.trim() || null;

  // if chatId exists, validate access and derive projectId if not provided
  if (chatId) {
    const existing = await getChat(actor, chatId);
    if (!existing) return attachActorCookies(jsonError("Chat not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
    if (!projectId) projectId = existing.projectId;
  }

  // if projectId provided, check access via getProject is inside create? we pre-check
  if (projectId) {
    const { getProject } = await import("@/lib/db/store");
    const proj = await getProject(actor, projectId);
    if (!proj) return attachActorCookies(jsonError("Project not found or access denied", 404), { actor, needsGuestCookie, needsSessionCleanup });
  }

  if (!chatId) {
    const title = message.slice(0, 72) || "New chat";
    chatId = await createChat(actor, { title, modelId: model.id, projectId, agentPreset: body.agentPreset ?? null });
  }

  // ensure chatId is string now
  const finalChatId = chatId as string;

  // append user message
  await appendMessage({
    chatId: finalChatId,
    role: "user",
    content: message,
    modelId: model.id,
  });

  await logAudit({
    actorUserId: actor.type === "user" ? actor.userId : null,
    action: "agent.run.user_message",
    targetType: "chat",
    targetId: finalChatId,
    payload: { projectId, modelId: model.id, traceId },
  });

  const hydrated = await getChatMessages(finalChatId);
  const mapped = hydrated.map((m) => ({
    role: m.role as "user" | "assistant" | "system" | "tool",
    content: m.content,
    toolCallId: m.toolCallId ?? undefined,
    toolName: undefined as string | undefined,
    toolCalls: m.toolCalls ?? undefined,
  }));

  const preset = body.agentPreset ?? undefined;
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (type: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      void (async () => {
        let assistantAccum = "";
        const citations: unknown[] = [];
        const toolEvents: Array<{ toolName: string; input: unknown; output: unknown; status: "ok" | "error"; latencyMs: number | null }> = [];
        let errorMessage: string | null = null;

        send("meta", { chatId: finalChatId, traceId, projectId });

        try {
          const gen = runAgent({
            messages: mapped,
            context: { chatId: finalChatId, projectId, actor, preset: preset as import("@/lib/types").AgentPreset | undefined, signal },
            projectId,
          });

          for await (const ev of gen) {
            if (signal.aborted) {
              send("error", { message: "aborted" });
              break;
            }
            if (ev.type === "token") {
              const text = (ev.data as { text: string }).text ?? "";
              assistantAccum += text;
              send("token", ev.data);
            } else if (ev.type === "tool_call") {
              send("tool_call", ev.data);
            } else if (ev.type === "tool_result") {
              const d = ev.data as { id: string; name: string; output: string; error?: string; ok: boolean; latencyMs?: number };
              toolEvents.push({
                toolName: d.name,
                input: { id: d.id },
                output: d.ok ? d.output : d.error ?? "error",
                status: d.ok ? "ok" : "error",
                latencyMs: d.latencyMs ?? null,
              });
              send("tool_result", ev.data);
            } else if (ev.type === "citations") {
              const d = ev.data as { citations: unknown[] };
              if (Array.isArray(d.citations)) citations.push(...d.citations);
              send("citations", ev.data);
            } else if (ev.type === "done") {
              const d = ev.data as Record<string, unknown>;
              if (d && Array.isArray((d as { citations?: unknown[] }).citations)) {
                const more = (d as { citations: unknown[] }).citations;
                citations.push(...more);
              }
              // don't send yet, will send after persisting
            } else if (ev.type === "error") {
              errorMessage = (ev.data as { message: string }).message ?? "agent error";
              send("error", ev.data);
            } else {
              send(ev.type, ev.data);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errorMessage = msg;
          try { send("error", { message: msg }); } catch { /* ignore */ }
        } finally {
          if (assistantAccum.trim()) {
            const uniqueCitations = citations.length ? (citations as []) : undefined;
            try {
              const msgId = await appendMessage({
                chatId: finalChatId,
                role: "assistant",
                content: assistantAccum,
                modelId: model.id,
                citations: uniqueCitations as unknown as import("@/lib/types").Citation[] | null,
              });
              for (const te of toolEvents) {
                await appendToolEvent({
                  chatId: finalChatId,
                  messageId: msgId,
                  toolName: te.toolName,
                  inputJson: te.input,
                  outputJson: te.output,
                  status: te.status,
                  latencyMs: te.latencyMs,
                }).catch(() => undefined);
              }
            } catch { /* ignore persist errors */ }
          }
          await logAudit({
            actorUserId: actor.type === "user" ? actor.userId : null,
            action: "agent.run.done",
            targetType: "chat",
            targetId: finalChatId,
            payload: { traceId, error: errorMessage, citationsCount: citations.length },
          }).catch(() => undefined);
          const cacheType = actor.type === "user" ? "user" as const : "guest" as const;
          const cacheId = actor.type === "user" ? actor.userId as string : actor.guestId as string;
          invalidateChatListCache(cacheType, cacheId);
          try {
            send("done", { chatId: finalChatId, traceId, citations });
          } catch { /* ignore */ }
          try { controller.close(); } catch { /* ignore */ }
        }
      })();
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Chat-Id": finalChatId,
    "X-Trace-Id": traceId,
    "X-Accel-Buffering": "no",
  };

  const res = new NextResponse(stream, { status: 200, headers });
  // attach guest cookie if needed
  if (needsGuestCookie) {
    const { ensureGuestCookie } = await import("@/lib/auth/session");
    ensureGuestCookie(res, actor.guestId);
  }
  if (needsSessionCleanup) {
    const { clearSessionCookie } = await import("@/lib/auth/session");
    clearSessionCookie(res);
  }
  return res;
}

export const dynamic = "force-dynamic";
