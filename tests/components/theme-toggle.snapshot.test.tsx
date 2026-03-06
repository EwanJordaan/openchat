import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

type ThemeMode = "system" | "light" | "dark";

let state: {
  mode: ThemeMode;
  resolvedTheme: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
} = {
  mode: "dark",
  resolvedTheme: "dark",
  setMode: () => undefined,
};

mock.module("@/components/providers/theme-provider", () => ({
  useTheme: () => state,
}));

let ThemeToggle: (typeof import("@/components/ui/theme-toggle"))["ThemeToggle"];

beforeAll(async () => {
  ({ ThemeToggle } = await import("@/components/ui/theme-toggle"));
});

afterAll(() => {
  mock.restore();
});

describe("components/ui/theme-toggle", () => {
  it("matches dark-state snapshot", () => {
    state = { ...state, mode: "dark", resolvedTheme: "dark" };
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toMatchSnapshot();
  });

  it("matches light-state snapshot", () => {
    state = { ...state, mode: "light", resolvedTheme: "light" };
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toMatchSnapshot();
  });
});
