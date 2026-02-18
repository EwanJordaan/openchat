import type { ModelProviderId } from "@/shared/model-providers";
import type {
  GenerateTextInput,
  GenerateTextResult,
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

const DEFAULT_MODELS: Record<ModelProviderId, string> = {
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-1.5-flash",
};

const REQUEST_TIMEOUT_MS = 45_000;

export class LiveModelProviderClient implements ModelProviderClient {
  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const normalizedMessages = normalizeMessages(input.messages);
    if (normalizedMessages.length === 0) {
      throw new ModelProviderConfigurationError("At least one chat message is required");
    }

    if (!this.isProviderConfigured(input.modelProvider)) {
      throw new ModelProviderConfigurationError(
        `${PROVIDER_LABELS[input.modelProvider]} API key is not configured`,
      );
    }

    const model = DEFAULT_MODELS[input.modelProvider];

    let text: string;
    if (input.modelProvider === "openrouter") {
      text = await requestOpenAiCompatibleResponse(
        "https://openrouter.ai/api/v1/chat/completions",
        process.env.OPENROUTER_API_KEY as string,
        model,
        normalizedMessages,
      );
    } else if (input.modelProvider === "openai") {
      text = await requestOpenAiCompatibleResponse(
        "https://api.openai.com/v1/chat/completions",
        process.env.OPENAI_API_KEY as string,
        model,
        normalizedMessages,
      );
    } else if (input.modelProvider === "anthropic") {
      text = await requestAnthropicResponse(
        process.env.ANTHROPIC_API_KEY as string,
        model,
        normalizedMessages,
      );
    } else {
      text = await requestGeminiResponse(
        process.env.GOOGLE_API_KEY as string,
        model,
        normalizedMessages,
      );
    }

    return {
      text,
      modelProvider: input.modelProvider,
      model,
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

async function requestOpenAiCompatibleResponse(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ModelProviderChatMessage[],
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = (await safeJson(response)) as OpenAiCompatibleResponse | null;
  if (!response.ok) {
    const fallbackMessage = `${extractLabelFromEndpoint(endpoint)} request failed (${response.status})`;
    throw new ModelProviderRequestError(payload?.error?.message ?? fallbackMessage);
  }

  const content = payload?.choices?.[0]?.message?.content;
  const text = normalizeTextContent(content);
  if (!text) {
    throw new ModelProviderRequestError("Provider returned an empty response");
  }

  return text;
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

function normalizeTextContent(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && "text" in item) {
        const value = item.text;
        return typeof value === "string" ? value : "";
      }

      return "";
    })
    .join("\n\n")
    .trim();

  return text.length > 0 ? text : null;
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
