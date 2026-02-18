export const OPENCHAT_MODEL_PROVIDER_IDS = ["openrouter", "openai", "gemini", "anthropic"] as const;

export type ModelProviderId = (typeof OPENCHAT_MODEL_PROVIDER_IDS)[number];

export interface ModelProviderOption {
  id: ModelProviderId;
  label: string;
  description: string;
}

export const OPENCHAT_MODEL_PROVIDER_OPTIONS: ModelProviderOption[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Unified routing across multiple foundation models.",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct provider path for GPT-family models.",
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Google Gemini model family.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude model family.",
  },
];

const modelProviderIds = new Set<string>(OPENCHAT_MODEL_PROVIDER_IDS);

export function isModelProviderId(value: string): value is ModelProviderId {
  return modelProviderIds.has(value);
}

export function resolveModelProviderId(
  raw: string | null | undefined,
  fallback: ModelProviderId,
): ModelProviderId {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized || !isModelProviderId(normalized)) {
    return fallback;
  }

  return normalized;
}
