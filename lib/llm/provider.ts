import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type CoreMessage, type LanguageModel } from "ai";

import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/security/encryption";

export interface LlmModel {
  id: string;
  displayName: string;
  provider: "openai" | "anthropic" | "voyage" | "local";
  supportsTools: boolean;
  contextWindow: number;
}

export const LLM_MODELS: LlmModel[] = [
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    provider: "openai",
    supportsTools: true,
    contextWindow: 128000,
  },
  {
    id: "gpt-4.1-mini",
    displayName: "GPT-4.1 mini",
    provider: "openai",
    supportsTools: true,
    contextWindow: 128000,
  },
  {
    id: "claude-3-5-haiku-latest",
    displayName: "Claude 3.5 Haiku",
    provider: "anthropic",
    supportsTools: true,
    contextWindow: 200000,
  },
  {
    id: "claude-3-5-sonnet-latest",
    displayName: "Claude 3.5 Sonnet",
    provider: "anthropic",
    supportsTools: true,
    contextWindow: 200000,
  },
];

/**
 * Wrapper around credential store — Phase 2 falls back to env directly.
 * If the value looks encrypted (contains ':'), try to decrypt via lib/security/encryption.
 */
export function getProviderCredential(provider: string): string | null {
  let raw: string | undefined;
  switch (provider) {
    case "openai":
      raw = env.OPENAI_API_KEY;
      break;
    case "anthropic":
      raw = env.ANTHROPIC_API_KEY;
      break;
    case "voyage":
      raw = env.VOYAGE_API_KEY;
      break;
    case "local":
      return null;
    default:
      raw = undefined;
  }
  if (!raw) return null;
  if (raw.includes(":")) {
    try {
      const decrypted = decryptSecret(raw);
      if (decrypted) return decrypted;
    } catch {
      // fall through to raw
    }
  }
  return raw;
}

function resolveProviderForModel(modelId: string): LlmModel["provider"] {
  const known = LLM_MODELS.find((m) => m.id === modelId);
  if (known) return known.provider;
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("voyage")) return "voyage";
  return "openai";
}

export function getLlm(modelId: string): LanguageModel | null {
  const provider = resolveProviderForModel(modelId);
  if (provider === "openai") {
    const key = getProviderCredential("openai");
    if (!key) return null;
    const openai = createOpenAI({
      apiKey: key,
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });
    return openai(modelId) as unknown as LanguageModel;
  }
  if (provider === "anthropic") {
    const key = getProviderCredential("anthropic");
    if (!key) return null;
    const anthropic = createAnthropic({ apiKey: key });
    // alias common shorthand
    const resolvedId = modelId === "claude-3-5-sonnet" ? "claude-3-5-sonnet-latest" : modelId;
    return anthropic(resolvedId) as unknown as LanguageModel;
  }
  // voyage and local have no chat model via this provider
  return null;
}

export interface StreamLlmOptions {
  model: string | LanguageModel;
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolCalls?: Array<{ id: string; name: string; input: unknown }>;
  }>;
  tools?: Record<string, unknown>;
  systemPrompt?: string;
  signal?: AbortSignal;
}

export function streamLlm(opts: StreamLlmOptions) {
  let model: LanguageModel | null = null;
  if (typeof opts.model === "string") {
    model = getLlm(opts.model);
  } else {
    model = opts.model;
  }
  if (!model) return null;

  const coreMessages: CoreMessage[] = opts.messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: m.toolCallId ?? "tool_1",
            toolName: m.toolName ?? "unknown",
            result: m.content,
          },
        ],
      } as unknown as CoreMessage;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const tc of m.toolCalls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.input ?? {},
        });
      }
      return { role: "assistant" as const, content } as unknown as CoreMessage;
    }
    return { role: m.role as "user" | "assistant" | "system", content: m.content } as CoreMessage;
  });

  return streamText({
    model,
    system: opts.systemPrompt,
    messages: coreMessages,
    tools: opts.tools as never,
    abortSignal: opts.signal,
  });
}
