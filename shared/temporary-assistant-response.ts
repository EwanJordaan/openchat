import type { ModelProviderId } from "@/shared/model-providers";

export function buildTemporaryAssistantResponse(
  userMessage: string,
  modelProvider: ModelProviderId,
): string {
  return `Temporary ${toProviderLabel(modelProvider)} response: I can help with this request. Next, wire this provider to your backend so replies come from a live model.\n\nYou said: "${userMessage}"`;
}

function toProviderLabel(modelProvider: ModelProviderId): string {
  if (modelProvider === "openrouter") {
    return "OpenRouter";
  }

  if (modelProvider === "openai") {
    return "OpenAI";
  }

  if (modelProvider === "gemini") {
    return "Gemini";
  }

  return "Anthropic";
}
