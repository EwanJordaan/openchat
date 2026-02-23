"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToggle() {
  const { mode, resolvedTheme, setMode } = useTheme();

  const nextMode = mode === "system" ? (resolvedTheme === "dark" ? "light" : "dark") : mode === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={() => setMode(nextMode)}
      title={`Switch to ${nextMode} theme`}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
      <span>{resolvedTheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
