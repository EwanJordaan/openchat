import type { ThemeId } from "@/shared/themes";
import {
  OPENCHAT_PROVIDER_MODEL_PRESETS,
  type ModelProviderId,
} from "@/shared/model-providers";

export interface OpenRouterRateLimitsConfig {
  guestRequestsPerDay: number;
  memberRequestsPerDay: number;
  adminRequestsPerDay: number;
}

export interface OpenRouterPolicyConfig {
  allowedModels: string[];
  rateLimits: OpenRouterRateLimitsConfig;
}

export interface OpenChatConfig {
  backend: {
    database: {
      defaultAdapter: "postgres" | "convex";
    };
    auth: {
      requireAuthenticationForSavedChats: boolean;
    };
  };
  features: {
    allowGuestResponses: boolean;
  };
  ai: {
    defaultModelProvider: ModelProviderId;
    allowUserModelProviderSelection: boolean;
    openrouter: OpenRouterPolicyConfig;
  };
  ui: {
    defaultTheme: ThemeId;
  };
}

export const openChatConfig: OpenChatConfig = {
  backend: {
    database: {
      defaultAdapter: "postgres",
    },
    auth: {
      requireAuthenticationForSavedChats: true,
    },
  },
  features: {
    allowGuestResponses: false,
  },
  ai: {
    defaultModelProvider: "openrouter",
    allowUserModelProviderSelection: true,
    openrouter: {
      allowedModels: OPENCHAT_PROVIDER_MODEL_PRESETS.openrouter.map((option) => option.id),
      rateLimits: {
        guestRequestsPerDay: 20,
        memberRequestsPerDay: 300,
        adminRequestsPerDay: 5_000,
      },
    },
  },
  ui: {
    defaultTheme: "default",
  },
};
