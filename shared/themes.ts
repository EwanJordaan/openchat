export const OPENCHAT_THEME_IDS = ["default", "galaxy", "aurora", "sunset", "midnight"] as const;

export type ThemeId = (typeof OPENCHAT_THEME_IDS)[number];

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const OPENCHAT_THEME_OPTIONS: ThemeOption[] = [
  {
    id: "default",
    label: "Default",
    description: "Flat gray workspace with a turquoise send button.",
  },
  {
    id: "galaxy",
    label: "Galaxy",
    description: "Current neon-cosmic interface.",
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Cool green-blue gradients with soft contrast.",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm dusk palette with peach highlights.",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "High-contrast slate palette for focused sessions.",
  },
];

const themeIds = new Set<string>(OPENCHAT_THEME_IDS);

export function isThemeId(value: string): value is ThemeId {
  return themeIds.has(value);
}

export function resolveThemeId(raw: string | null | undefined, fallback: ThemeId): ThemeId {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized || !isThemeId(normalized)) {
    return fallback;
  }

  return normalized;
}
