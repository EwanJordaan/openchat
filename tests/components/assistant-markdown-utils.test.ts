import { describe, expect, it } from "bun:test";

import { normalizeLatexDelimiters } from "@/components/chat/assistant-markdown-utils";

describe("assistant markdown latex delimiter normalization", () => {
  it("converts inline bracket math delimiters", () => {
    expect(normalizeLatexDelimiters("Value: \\(a+b\\).")).toBe("Value: $a+b$.");
  });

  it("converts block bracket math delimiters", () => {
    const input = "Start\n\\[\na^2+b^2=c^2\n\\]\nEnd";
    const output = "Start\n$$\na^2+b^2=c^2\n$$\nEnd";
    expect(normalizeLatexDelimiters(input)).toBe(output);
  });

  it("skips fenced code blocks", () => {
    const input = "```ts\nconst x = \"\\\\(a+b\\\\)\";\n```\nOutside: \\(x+y\\)";
    const output = "```ts\nconst x = \"\\\\(a+b\\\\)\";\n```\nOutside: $x+y$";
    expect(normalizeLatexDelimiters(input)).toBe(output);
  });

  it("skips inline code spans", () => {
    const input = "Use `\\(a+b\\)` in docs, real math: \\(c+d\\).";
    const output = "Use `\\(a+b\\)` in docs, real math: $c+d$.";
    expect(normalizeLatexDelimiters(input)).toBe(output);
  });

  it("leaves unmatched delimiters unchanged", () => {
    expect(normalizeLatexDelimiters("Broken: \\(a+b")).toBe("Broken: \\(a+b");
    expect(normalizeLatexDelimiters("Broken: \\[a+b")).toBe("Broken: \\[a+b");
  });

  it("preserves escaped delimiter literals", () => {
    expect(normalizeLatexDelimiters("Literal \\\\( remains and math \\(x\\).")).toBe("Literal \\\\( remains and math $x$.");
  });
});
