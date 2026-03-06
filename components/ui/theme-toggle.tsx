"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";

export function getNextMode(mode: "system" | "light" | "dark", resolvedTheme: "light" | "dark") {
  if (mode === "system") {
    return resolvedTheme === "dark" ? "light" : "dark";
  }
  return mode === "dark" ? "light" : "dark";
}

export function ThemeToggle() {
  const { mode, resolvedTheme, setMode } = useTheme();

  const nextMode = getNextMode(mode, resolvedTheme);

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
