import type { ThemeId } from "@/shared/themes";
import type { ModelProviderId } from "@/shared/model-providers";

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
  },
  ui: {
    defaultTheme: "default",
  },
};
