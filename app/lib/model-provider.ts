import type { ModelProviderId } from "@/shared/model-providers";
import { resolveModelProviderId } from "@/shared/model-providers";

const MODEL_PROVIDER_STORAGE_KEY = "openchat_model_provider";

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

export { MODEL_PROVIDER_STORAGE_KEY };
