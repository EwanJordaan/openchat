import { env } from "@/lib/env";
import { getProviderCredential } from "@/lib/db/store";
import type { ChatMessage, ModelOption } from "@/lib/types";

interface GenerateResponseInput {
  model: ModelOption;
  messages: ChatMessage[];
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

export async function generateAssistantReply({ model, messages }: GenerateResponseInput) {
  const userPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const provider = await getProviderCredential(model.provider);
  const apiKey = provider?.apiKey || env.OPENAI_API_KEY || "";
  const baseUrl = (provider?.baseUrl || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const providerEnabled = provider ? provider.isEnabled : true;

  if (!providerEnabled || !apiKey) {
    return {
      content: buildFallbackReply(userPrompt, model.displayName),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      providerStatus: !providerEnabled ? "Provider disabled" : "Missing API key",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: toOpenAiMessages(messages).slice(-24),
        max_tokens: model.maxOutputTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: `The model request failed (${response.status}).\n\n${errorText.slice(0, 300)}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        providerStatus: `Provider returned ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    return {
      content: content || "I could not produce a response for that prompt.",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      providerStatus: "ok",
    };
  } catch (error) {
    return {
      content: `I could not reach the provider network right now.\n\n${error instanceof Error ? error.message : "Unknown error"}`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      providerStatus: "Network failure",
    };
  }
}
