import { env } from "@/lib/env";
import { getProviderCredential } from "@/lib/db/store";
import type { ChatMessage, ModelOption } from "@/lib/types";

interface GenerateResponseInput {
  model: ModelOption;
  messages: ChatMessage[];
}

interface StreamResponseInput extends GenerateResponseInput {
  signal?: AbortSignal;
  onToken: (token: string) => void | Promise<void>;
}

interface StreamRateLimiter {
  push(token: string): Promise<void>;
  flush(): Promise<void>;
}

interface AssistantUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function toOpenAiMessages(messages: ChatMessage[]): OpenAiMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function buildFallbackReply(prompt: string, modelName: string) {
  return `(${modelName} demo mode) I received: "${prompt.slice(0, 280)}".\n\nSet your provider API key in Admin Dashboard to get real model responses.`;
}

function extractDeltaContent(delta: unknown) {
  if (!delta || typeof delta !== "object") return "";
  const record = delta as { content?: unknown };
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    return record.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const typedPart = part as { type?: unknown; text?: unknown };
        return typedPart.type === "text" && typeof typedPart.text === "string" ? typedPart.text : "";
      })
      .join("");
  }
  return "";
}

function createStreamRateLimiter(onToken: StreamResponseInput["onToken"]): StreamRateLimiter {
  const BATCH_INTERVAL_MS = 16;
  const MAX_BUFFER_CHARS = 200;

  let pending = "";
  let lastFlushAt = 0;

  async function flushNow() {
    if (!pending) return;
    const chunk = pending;
    pending = "";
    lastFlushAt = Date.now();
    await onToken(chunk);
  }

  return {
    async push(token: string) {
      pending += token;
      const now = Date.now();
      if (pending.length >= MAX_BUFFER_CHARS || now - lastFlushAt >= BATCH_INTERVAL_MS) {
        await flushNow();
      }
    },
    async flush() {
      await flushNow();
    },
  };
}

export async function streamAssistantReply({ model, messages, signal, onToken }: StreamResponseInput) {
  const userPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const provider = await getProviderCredential(model.provider);
  const apiKey = provider?.apiKey || env.OPENAI_API_KEY || "";
  const baseUrl = (provider?.baseUrl || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const providerEnabled = provider ? provider.isEnabled : true;
  const isOpenRouter = model.provider.toLowerCase() === "openrouter" || /openrouter\.ai/i.test(baseUrl);

  if (!providerEnabled || !apiKey) {
    const content = buildFallbackReply(userPrompt, model.displayName);
    await onToken(content);
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as AssistantUsage,
      providerStatus: !providerEnabled ? "Provider disabled" : "Missing API key",
      stopped: false,
    };
  }

  let accumulated = "";
  const usage: AssistantUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const limiter = createStreamRateLimiter(onToken);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(isOpenRouter
          ? {
              "HTTP-Referer": env.APP_URL,
              "X-Title": "OpenChat",
            }
          : {}),
      },
      body: JSON.stringify({
        model: model.id,
        messages: toOpenAiMessages(messages).slice(-24),
        max_tokens: model.maxOutputTokens,
        temperature: 0.7,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const content = `The model request failed (${response.status}).\n\n${errorText.slice(0, 300)}`;
      await onToken(content);
      return {
        content,
        usage,
        providerStatus: `Provider returned ${response.status}`,
        stopped: false,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const content = "The provider did not return a readable stream.";
      await onToken(content);
      return {
        content,
        usage,
        providerStatus: "Provider stream unavailable",
        stopped: false,
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: unknown } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };

          if (parsed.usage) {
            usage.promptTokens = parsed.usage.prompt_tokens ?? usage.promptTokens;
            usage.completionTokens = parsed.usage.completion_tokens ?? usage.completionTokens;
            usage.totalTokens = parsed.usage.total_tokens ?? usage.totalTokens;
          }

          const deltaText = extractDeltaContent(parsed.choices?.[0]?.delta);
          if (!deltaText) continue;
          accumulated += deltaText;
          await limiter.push(deltaText);
        } catch {
          continue;
        }
      }
    }

    await limiter.flush();

    if (!accumulated.trim()) {
      const fallback = "I could not produce a response for that prompt.";
      accumulated = fallback;
      await limiter.push(fallback);
      await limiter.flush();
    }

    return {
      content: accumulated,
      usage,
      providerStatus: "ok",
      stopped: false,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        content: accumulated,
        usage,
        providerStatus: "Aborted",
        stopped: true,
      };
    }

    const content = `I could not reach the provider network right now.\n\n${error instanceof Error ? error.message : "Unknown error"}`;
    if (!accumulated) {
      await onToken(content);
      accumulated = content;
    }
    return {
      content: accumulated,
      usage,
      providerStatus: "Network failure",
      stopped: false,
    };
  }
}

export async function generateAssistantReply({ model, messages }: GenerateResponseInput) {
  let content = "";
  const streamed = await streamAssistantReply({
    model,
    messages,
    onToken: (token) => {
      content += token;
    },
  });

  return {
    content: content || streamed.content,
    usage: streamed.usage,
    providerStatus: streamed.providerStatus,
  };
}
