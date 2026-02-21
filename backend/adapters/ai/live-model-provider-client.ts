import {
  OPENCHAT_PROVIDER_DEFAULT_MODELS,
  resolveModelId,
  type ModelProviderId,
} from "@/shared/model-providers";
import type {
  GenerateTextInput,
  GenerateTextResult,
  GenerateTextStreamResult,
  ModelProviderChatMessage,
  ModelProviderClient,
} from "@/backend/ports/model-provider-client";
import {
  ModelProviderConfigurationError,
  ModelProviderRequestError,
} from "@/backend/ports/model-provider-client";

const PROVIDER_LABELS: Record<ModelProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

const REQUEST_TIMEOUT_MS = 45_000;

export class LiveModelProviderClient implements ModelProviderClient {
  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const streamResult = await this.generateTextStream(input);

    let text = "";
    for await (const chunk of streamResult.chunks) {
      text += chunk;
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      throw new ModelProviderRequestError("Provider returned an empty response");
    }

    return {
      text: normalizedText,
      modelProvider: streamResult.modelProvider,
      model: streamResult.model,
    };
  }

  async generateTextStream(input: GenerateTextInput): Promise<GenerateTextStreamResult> {
    const normalizedMessages = normalizeMessages(input.messages);
    if (normalizedMessages.length === 0) {
      throw new ModelProviderConfigurationError("At least one chat message is required");
    }

    if (!this.isProviderConfigured(input.modelProvider)) {
      throw new ModelProviderConfigurationError(
        `${PROVIDER_LABELS[input.modelProvider]} API key is not configured`,
      );
    }

    const model = resolveModelId(
      input.model,
      OPENCHAT_PROVIDER_DEFAULT_MODELS[input.modelProvider],
    );

    let chunks: AsyncIterable<string>;
    if (input.modelProvider === "openrouter") {
      chunks = await requestOpenAiCompatibleStreamResponse(
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY as string,
        model,
        normalizedMessages,
      );
    } else if (input.modelProvider === "openai") {
      chunks = await requestOpenAiCompatibleStreamResponse(
        "https://api.openai.com/v1/chat/completions",
        process.env.OPENAI_API_KEY as string,
        model,
        normalizedMessages,
      );
    } else if (input.modelProvider === "anthropic") {
      const text = await requestAnthropicResponse(
        process.env.ANTHROPIC_API_KEY as string,
        model,
        normalizedMessages,
      );
      chunks = singleChunk(text);
    } else {
      const text = await requestGeminiResponse(
        process.env.GOOGLE_API_KEY as string,
        model,
        normalizedMessages,
      );
      chunks = singleChunk(text);
    }

    return {
      modelProvider: input.modelProvider,
      model,
      chunks,
    };
  }

  isProviderConfigured(provider: ModelProviderId): boolean {
    return Boolean(getProviderApiKey(provider));
  }
}

function normalizeMessages(messages: ModelProviderChatMessage[]): ModelProviderChatMessage[] {
  return messages
    .map((message) => ({
      ...message,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function getProviderApiKey(provider: ModelProviderId): string | undefined {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_API_KEY?.trim();
  }

  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim();
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY?.trim();
  }

  return process.env.GOOGLE_API_KEY?.trim();
}

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAiCompatibleStreamResponse {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
}

async function requestOpenAiCompatibleStreamResponse(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ModelProviderChatMessage[],
): Promise<AsyncIterable<string>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const payload = (await safeJson(response)) as OpenAiCompatibleResponse | null;
    const fallbackMessage = `${extractLabelFromEndpoint(endpoint)} request failed (${response.status})`;
    throw new ModelProviderRequestError(payload?.error?.message ?? fallbackMessage);
  }

  if (!response.body) {
    throw new ModelProviderRequestError("Provider returned an empty streaming response");
  }

  return streamOpenAiCompatibleChunks(response.body);
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

async function requestAnthropicResponse(
  apiKey: string,
  model: string,
  messages: ModelProviderChatMessage[],
): Promise<string> {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const conversationMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(systemText ? { system: systemText } : {}),
      messages: conversationMessages,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = (await safeJson(response)) as AnthropicResponse | null;
  if (!response.ok) {
    const fallbackMessage = `Anthropic request failed (${response.status})`;
    throw new ModelProviderRequestError(payload?.error?.message ?? fallbackMessage);
  }

  const text = (payload?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text?.trim() ?? "")
    .filter((value) => value.length > 0)
    .join("\n\n");

  if (!text) {
    throw new ModelProviderRequestError("Anthropic returned an empty response");
  }

  return text;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

async function requestGeminiResponse(
  apiKey: string,
  model: string,
  messages: ModelProviderChatMessage[],
): Promise<string> {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const conversationMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...(systemText
          ? {
              systemInstruction: {
                parts: [{ text: systemText }],
              },
            }
          : {}),
        contents: conversationMessages,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  const payload = (await safeJson(response)) as GeminiResponse | null;
  if (!response.ok) {
    const fallbackMessage = `Gemini request failed (${response.status})`;
    throw new ModelProviderRequestError(payload?.error?.message ?? fallbackMessage);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text?.trim() ?? "")
    .filter((value) => value.length > 0)
    .join("\n\n");

  if (!text) {
    throw new ModelProviderRequestError("Gemini returned an empty response");
  }

  return text;
}

async function safeJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function* streamOpenAiCompatibleChunks(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lineBreakIndex = buffer.indexOf("\n");
        if (lineBreakIndex < 0) {
          break;
        }

        const rawLine = buffer.slice(0, lineBreakIndex);
        buffer = buffer.slice(lineBreakIndex + 1);

        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }

        const payloadText = line.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") {
          continue;
        }

        const payload = tryParseJson(payloadText) as OpenAiCompatibleStreamResponse | null;
        if (!payload) {
          continue;
        }

        const deltaContent = payload.choices?.[0]?.delta?.content;
        const chunk = normalizeDeltaContent(deltaContent);
        if (chunk) {
          yield chunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* singleChunk(text: string): AsyncGenerator<string, void, undefined> {
  if (text.length > 0) {
    yield text;
  }
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeDeltaContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content.length > 0 ? content : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const combined = content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "text" in item) {
        const text = item.text;
        return typeof text === "string" ? text : "";
      }

      return "";
    })
    .join("");

  return combined.length > 0 ? combined : null;
}

function extractLabelFromEndpoint(endpoint: string): string {
  if (endpoint.includes("openrouter.ai")) {
    return "OpenRouter";
  }

  if (endpoint.includes("openai.com")) {
    return "OpenAI";
  }

  return "Provider";
}
