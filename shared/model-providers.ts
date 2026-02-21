export const OPENCHAT_MODEL_PROVIDER_IDS = ["openrouter", "openai", "gemini", "anthropic"] as const;

export type ModelProviderId = (typeof OPENCHAT_MODEL_PROVIDER_IDS)[number];

export interface ModelProviderOption {
  id: ModelProviderId;
  label: string;
  description: string;
}

export interface ModelPresetOption {
  id: string;
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

export const OPENCHAT_PROVIDER_DEFAULT_MODELS: Record<ModelProviderId, string> = {
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  anthropic: "claude-3-5-haiku-latest",
};

export const OPENCHAT_PROVIDER_MODEL_PRESETS: Record<ModelProviderId, ModelPresetOption[]> = {
  openrouter: [
    {
      id: "openai/gpt-4o-mini",
      label: "GPT-4o mini",
      description: "Fast and cost-effective OpenAI model via OpenRouter.",
    },
    {
      id: "openai/gpt-4o",
      label: "GPT-4o",
      description: "Higher quality multi-purpose model via OpenRouter.",
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      label: "Claude 3.5 Sonnet",
      description: "Strong reasoning and writing model via OpenRouter.",
    },
    {
      id: "google/gemini-1.5-pro",
      label: "Gemini 1.5 Pro",
      description: "Large context and analysis model via OpenRouter.",
    },
  ],
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      description: "Fast and cost-effective OpenAI model.",
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      description: "Higher quality OpenAI model for broad tasks.",
    },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 mini",
      description: "Balanced quality and latency for everyday use.",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      description: "High-capability model for complex requests.",
    },
  ],
  gemini: [
    {
      id: "gemini-1.5-flash",
      label: "Gemini 1.5 Flash",
      description: "Fast Gemini model for interactive chat.",
    },
    {
      id: "gemini-1.5-pro",
      label: "Gemini 1.5 Pro",
      description: "Higher quality Gemini model for deeper reasoning.",
    },
    {
      id: "gemini-2.0-flash-exp",
      label: "Gemini 2.0 Flash (exp)",
      description: "Experimental next-gen Gemini flash model.",
    },
  ],
  anthropic: [
    {
      id: "claude-3-5-haiku-latest",
      label: "Claude 3.5 Haiku",
      description: "Fast Anthropic model for daily chat tasks.",
    },
    {
      id: "claude-3-5-sonnet-latest",
      label: "Claude 3.5 Sonnet",
      description: "Balanced Anthropic model for quality and speed.",
    },
    {
      id: "claude-3-opus-latest",
      label: "Claude 3 Opus",
      description: "Highest capability Anthropic model for hard tasks.",
    },
  ],
};

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

export function resolveModelId(raw: string | null | undefined, fallback: string): string {
  const normalized = raw?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}
