import type { ThemeId } from "@/shared/themes";
import { resolveThemeId } from "@/shared/themes";

const THEME_STORAGE_KEY = "openchat_theme";

function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function applyThemeAttributes(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;

  if (document.body) {
    document.body.dataset.theme = theme;
  }
}

export function getThemePreference(fallback: ThemeId): ThemeId {
  if (!hasDom()) {
    return fallback;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return resolveThemeId(storedTheme, fallback);
  } catch {
    return fallback;
  }
}

export function applyTheme(theme: ThemeId): void {
  if (!hasDom()) {
    return;
  }

  applyThemeAttributes(theme);
}

export function setThemePreference(theme: ThemeId): void {
  if (!hasDom()) {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    applyTheme(theme);
    return;
  }

  applyTheme(theme);
}

export function initializeTheme(fallback: ThemeId): ThemeId {
  const resolvedTheme = getThemePreference(fallback);
  applyTheme(resolvedTheme);
  return resolvedTheme;
}

export { THEME_STORAGE_KEY };
