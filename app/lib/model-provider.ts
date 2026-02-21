import type { ModelProviderId } from "@/shared/model-providers";
import { resolveModelProviderId } from "@/shared/model-providers";

const MODEL_PROVIDER_STORAGE_KEY = "openchat_model_provider";
const MODEL_PRESET_BY_PROVIDER_STORAGE_KEY = "openchat_model_preset_by_provider";
const CUSTOM_MODEL_BY_PROVIDER_STORAGE_KEY = "openchat_custom_model_by_provider";

type PerProviderModelMap = Partial<Record<ModelProviderId, string>>;

function hasDom(): boolean {
  return typeof window !== "undefined";
}

export function getModelProviderPreference(fallback: ModelProviderId): ModelProviderId {
  if (!hasDom()) {
    return fallback;
  }

  try {
    const storedProvider = window.localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY);
    return resolveModelProviderId(storedProvider, fallback);
  } catch {
    return fallback;
  }
}

export function setModelProviderPreference(provider: ModelProviderId): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.setItem(MODEL_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // Ignore storage write failures.
  }
}

export function initializeModelProvider(fallback: ModelProviderId): ModelProviderId {
  return getModelProviderPreference(fallback);
}

export function getModelPresetPreference(provider: ModelProviderId, fallback: string): string {
  const map = readPerProviderModelMap(MODEL_PRESET_BY_PROVIDER_STORAGE_KEY);
  const value = map[provider]?.trim();
  if (!value) {
    return fallback;
  }

  return value;
}

export function setModelPresetPreference(provider: ModelProviderId, model: string): void {
  const trimmed = model.trim();
  if (!trimmed) {
    return;
  }

  const map = readPerProviderModelMap(MODEL_PRESET_BY_PROVIDER_STORAGE_KEY);
  map[provider] = trimmed;
  writePerProviderModelMap(MODEL_PRESET_BY_PROVIDER_STORAGE_KEY, map);
}

export function getCustomModelPreference(provider: ModelProviderId): string {
  const map = readPerProviderModelMap(CUSTOM_MODEL_BY_PROVIDER_STORAGE_KEY);
  return map[provider]?.trim() ?? "";
}

export function setCustomModelPreference(provider: ModelProviderId, model: string): void {
  const map = readPerProviderModelMap(CUSTOM_MODEL_BY_PROVIDER_STORAGE_KEY);
  const trimmed = model.trim();
  if (trimmed) {
    map[provider] = trimmed;
  } else {
    delete map[provider];
  }

  writePerProviderModelMap(CUSTOM_MODEL_BY_PROVIDER_STORAGE_KEY, map);
}

function readPerProviderModelMap(storageKey: string): PerProviderModelMap {
  if (!hasDom()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const next: PerProviderModelMap = {};
    for (const provider of ["openrouter", "openai", "gemini", "anthropic"] as const) {
      const value = (parsed as Record<string, unknown>)[provider];
      if (typeof value === "string" && value.trim().length > 0) {
        next[provider] = value.trim();
      }
    }

    return next;
  } catch {
    return {};
  }
}

function writePerProviderModelMap(storageKey: string, map: PerProviderModelMap): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Ignore storage write failures.
  }
}

export { MODEL_PROVIDER_STORAGE_KEY };
