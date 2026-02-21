import type {
  ModelPresetOption,
  ModelProviderId,
  ModelProviderOption,
} from "@/shared/model-providers";

interface ApiResponse<TData> {
  data?: TData;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface ModelProviderAvailability extends ModelProviderOption {
  configured: boolean;
  defaultModel: string;
  models: ModelPresetOption[];
}

export interface ModelProvidersSnapshot {
  defaultModelProvider: ModelProviderId;
  allowUserModelProviderSelection: boolean;
  openrouterRateLimits: {
    guestRequestsPerDay: number;
    memberRequestsPerDay: number;
    adminRequestsPerDay: number;
  };
  providers: ModelProviderAvailability[];
}

export async function fetchModelProviders(signal?: AbortSignal): Promise<ModelProvidersSnapshot> {
  const response = await fetch("/api/v1/model-providers", {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load model providers (${response.status})`);
  }

  const payload = (await response.json()) as ApiResponse<ModelProvidersSnapshot>;
  if (!payload.data) {
    throw new Error("Model providers response did not include data");
  }

  return payload.data;
}
