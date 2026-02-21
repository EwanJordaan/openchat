import { openChatConfig } from "@/openchat.config";
import { type ModelProviderId, resolveModelProviderId } from "@/shared/model-providers";
import { type ThemeId, resolveThemeId } from "@/shared/themes";

export interface PublicSiteConfig {
  features: {
    allowGuestResponses: boolean;
  };
  ai: {
    defaultModelProvider: ModelProviderId;
    allowUserModelProviderSelection: boolean;
  };
  ui: {
    defaultTheme: ThemeId;
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  return {
    features: {
      allowGuestResponses: parseBooleanEnv(
        process.env.NEXT_PUBLIC_ALLOW_GUEST_RESPONSES,
        openChatConfig.features.allowGuestResponses,
      ),
    },
    ai: {
      defaultModelProvider: parseModelProviderEnv(
        process.env.NEXT_PUBLIC_DEFAULT_MODEL_PROVIDER,
        openChatConfig.ai.defaultModelProvider,
      ),
      allowUserModelProviderSelection: parseBooleanEnv(
        process.env.NEXT_PUBLIC_ALLOW_USER_MODEL_PROVIDER_SELECTION,
        openChatConfig.ai.allowUserModelProviderSelection,
      ),
    },
    ui: {
      defaultTheme: parseThemeEnv(process.env.NEXT_PUBLIC_DEFAULT_THEME, openChatConfig.ui.defaultTheme),
    },
  };
}

function parseModelProviderEnv(raw: string | undefined, fallback: ModelProviderId): ModelProviderId {
  return resolveModelProviderId(raw, fallback);
}

function parseThemeEnv(raw: string | undefined, fallback: ThemeId): ThemeId {
  return resolveThemeId(raw, fallback);
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return fallback;
}
