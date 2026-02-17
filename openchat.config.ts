import type { ThemeId } from "@/shared/themes";

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
  ui: {
    defaultTheme: "default",
  },
};
