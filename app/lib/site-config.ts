import { openChatConfig } from "@/openchat.config";
import { type ThemeId, resolveThemeId } from "@/shared/themes";

export interface PublicSiteConfig {
  features: {
    allowGuestResponses: boolean;
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
    ui: {
      defaultTheme: parseThemeEnv(process.env.NEXT_PUBLIC_DEFAULT_THEME, openChatConfig.ui.defaultTheme),
    },
  };
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
