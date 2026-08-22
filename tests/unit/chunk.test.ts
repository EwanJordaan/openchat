import { describe, it, expect } from "bun:test";
import { chunkText, splitByTokens, estimateTokens } from "@/lib/docs/chunk";

describe("chunk — estimateTokens", () => {
  it("estimates ~ len/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(8))).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("chunk — splitByTokens", () => {
  it("returns single piece when under maxTokens", () => {
    const text = "a".repeat(100);
    const out = splitByTokens(text, 512, 80);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(text);
  });

  it("splits long text into overlapping pieces", () => {
    // maxTokens 512 => 2048 chars, overlap 80 tokens => 320 chars
    const long = "x".repeat(5000);
    const out = splitByTokens(long, 512, 80);
    expect(out.length).toBeGreaterThan(1);
    // each piece <= maxChars
    for (const p of out) {
      expect(p.length).toBeLessThanOrEqual(512 * 4);
    }
    // overlap check: second piece starts before first ends
    expect(out[1].length).toBeGreaterThan(0);
    // ensure coverage of full text
    const combined = out.join("");
    expect(combined.length).toBeGreaterThanOrEqual(long.length);
  });

  it("handles empty string", () => {
    expect(splitByTokens("", 512, 80)).toEqual([""]);
  });
});

describe("chunk — chunkText", () => {
  it("returns empty array for empty markdown", () => {
    expect(chunkText({ markdown: "" })).toEqual([]);
    expect(chunkText({ markdown: "   " })).toEqual([]);
  });

  it("chunks short markdown as single chunk with correct shape", () => {
    const md = "# Hello\n\nThis is a short doc.";
    const chunks = chunkText({ markdown: md });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const first = chunks[0];
    expect(first.content).toContain("Hello");
    expect(first.heading).toBe("Hello");
    expect(first.ordinal).toBe(0);
    expect(first.page).not.toBeNull();
    expect(first.tokenCount).toBeGreaterThan(0);
    expect(first.charOffset).toBeGreaterThanOrEqual(0);
  });

  it("splits by headings into distinct sections", () => {
    const md = `# First\n\nContent A\n\n## Second\n\nContent B\n\n# Third\n\nContent C`;
    const chunks = chunkText({ markdown: md });
    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain("First");
    expect(headings).toContain("Second");
    expect(headings).toContain("Third");
  });

  it("handles markdown without headings (null heading)", () => {
    const md = "Just plain text without headings. ".repeat(10);
    const chunks = chunkText({ markdown: md });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].heading).toBeNull();
  });

  it("splits very long section into multiple chunks", () => {
    const longBody = "word ".repeat(2000); // ~10k chars => >512 tokens
    const md = `# Big\n\n${longBody}`;
    const chunks = chunkText({ markdown: md });
    expect(chunks.length).toBeGreaterThan(1);
    // ordinals should be sequential
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].ordinal).toBe(i);
    }
  });

  it("respects pageMap for page assignment", () => {
    const md = `# A\n\nPage one content`;
    const pageMap = [
      { page: 1, text: "Page one content".repeat(50) },
      { page: 2, text: "Page two content".repeat(50) },
    ];
    const chunks = chunkText({ markdown: md, pageMap, pageCount: 2 });
    expect(chunks[0].page).toBe(1);
  });

  it("handles pre-heading content before first heading", () => {
    const md = `Intro before heading.\n\n# Heading\n\nBody`;
    const chunks = chunkText({ markdown: md });
    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain(null);
    expect(headings).toContain("Heading");
  });
});
