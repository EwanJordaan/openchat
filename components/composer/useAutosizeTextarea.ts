"use client";

import { useEffect, type RefObject } from "react";

export function measureTextareaHeight(scrollHeight: number, maxHeight: number, minHeight = 44) {
  const nextHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
  return {
    height: `${nextHeight}px`,
    overflowY: (scrollHeight > maxHeight ? "auto" : "hidden") as "auto" | "hidden",
  };
}

export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options?: { maxHeight?: number; minHeight?: number },
) {
  const maxHeight = options?.maxHeight ?? 140;
  const minHeight = options?.minHeight ?? 44;
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "0px";
    const { height, overflowY } = measureTextareaHeight(ta.scrollHeight, maxHeight, minHeight);
    ta.style.height = height;
    ta.style.overflowY = overflowY;
  }, [maxHeight, minHeight, ref, value]);
}

export function shouldSubmitTextareaShortcut(input: { key: string; shiftKey: boolean; isComposing?: boolean }) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
}
