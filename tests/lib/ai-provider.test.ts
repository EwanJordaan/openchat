import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";

import type { ChatMessage, ModelOption } from "@/lib/types";
import * as store from "@/lib/db/store";

const getProviderCredential = spyOn(store, "getProviderCredential");

let streamAssistantReply: (typeof import("@/lib/ai/provider"))["streamAssistantReply"];

const model: ModelOption = {
  id: "gpt-4o-mini",
  displayName: "GPT-4o mini",
  provider: "openai",
  description: "test model",
  isEnabled: true,
  isDefault: true,
  isGuestAllowed: true,
  maxOutputTokens: 1024,
};

const messages: ChatMessage[] = [
  {
    id: "m1",
    chatId: "c1",
    role: "user",
    content: "hello",
    modelId: model.id,
    createdAt: "2024-01-01T00:00:00.000Z",
    attachments: [],
  },
];

const originalFetch = globalThis.fetch;

beforeAll(async () => {
  ({ streamAssistantReply } = await import("@/lib/ai/provider"));
});

afterEach(() => {
  getProviderCredential.mockClear();
  globalThis.fetch = originalFetch;
});

describe("lib/ai/provider", () => {
  it("uses local fallback when provider key is missing", async () => {
    getProviderCredential.mockResolvedValue(null);
    const tokens: string[] = [];

    const result = await streamAssistantReply({
      model,
      messages,
      onToken: (token) => {
        tokens.push(token);
      },
    });

    expect(result.providerStatus).toBe("Missing API key");
    expect(result.content).toContain("demo mode");
    expect(tokens.join("")).toBe(result.content);
  });

  it("handles stream chunks and usage metadata", async () => {
    getProviderCredential.mockResolvedValue({
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      isEnabled: true,
    });

    const encoder = new TextEncoder();
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n' +
              'data: {"choices":[{"delta":{"content":" there"}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n' +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });

    globalThis.fetch = mock(async () => {
      return new Response(streamBody, { status: 200 });
    }) as unknown as typeof fetch;

    const tokens: string[] = [];
    const result = await streamAssistantReply({
      model,
      messages,
      onToken: (token) => {
        tokens.push(token);
      },
    });

    expect(result.providerStatus).toBe("ok");
    expect(result.content).toBe("Hi there");
    expect(tokens.join("")).toBe("Hi there");
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  });

  it("returns provider status on non-OK upstream responses", async () => {
    getProviderCredential.mockResolvedValue({
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      isEnabled: true,
    });

    globalThis.fetch = mock(async () => {
      return new Response("Bad upstream", { status: 502 });
    }) as unknown as typeof fetch;

    const result = await streamAssistantReply({
      model,
      messages,
      onToken: () => undefined,
    });

    expect(result.providerStatus).toBe("Provider returned 502");
    expect(result.content).toContain("failed (502)");
  });
});
