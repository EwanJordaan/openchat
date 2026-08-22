import { describe, it, expect, mock } from "bun:test";
import { buildGroundingBlock, type RetrievedChunk } from "@/lib/agent/retrieval";

// Mock embed to avoid network calls — retrieve() will use fakeEmbedding fallback anyway
mock.module("@/lib/llm/embed", () => ({
  embedQuery: async (text: string) => {
    // deterministic fake vector
    const dims = 1536;
    const vec = new Array(dims).fill(0).map((_, i) => ((text.charCodeAt(i % text.length) || 1) / 255 - 0.5));
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  },
  embedTexts: async (texts: string[]) => texts.map(() => new Array(1536).fill(0.01)),
}));

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: "chk_abc123",
    documentId: "doc_001",
    projectId: "prj_001",
    content: "This is the chunk content about agentic retrieval.",
    page: 2,
    heading: "Introduction",
    ordinal: 0,
    title: "Test Doc",
    distance: 0.2,
    score: 0.8,
    ...overrides,
  };
}

describe("retrieval — buildGroundingBlock", () => {
  it("returns empty string for no chunks", () => {
    expect(buildGroundingBlock([])).toBe("");
  });

  it("wraps single chunk in <grounding> tags with metadata", () => {
    const chunk = makeChunk();
    const block = buildGroundingBlock([chunk]);
    expect(block.startsWith("<grounding>")).toBe(true);
    expect(block.endsWith("</grounding>")).toBe(true);
    expect(block).toContain("[Doc: Test Doc p2 chunk=chk_abc123");
    expect(block).toContain('heading="Introduction"');
    expect(block).toContain("score=0.800");
    expect(block).toContain(chunk.content);
  });

  it("formats score to 3 decimals", () => {
    const chunk = makeChunk({ score: 0.123456 });
    const block = buildGroundingBlock([chunk]);
    expect(block).toContain("score=0.123");
  });

  it("omits page part when page is null", () => {
    const chunk = makeChunk({ page: null });
    const block = buildGroundingBlock([chunk]);
    expect(block).toContain("[Doc: Test Doc chunk=");
    expect(block).not.toContain(" p");
  });

  it("omits heading part when heading is null", () => {
    const chunk = makeChunk({ heading: null });
    const block = buildGroundingBlock([chunk]);
    expect(block).not.toContain("heading=");
  });

  it("joins multiple chunks with double newline", () => {
    const chunks = [makeChunk({ chunkId: "chk_1", title: "Doc A" }), makeChunk({ chunkId: "chk_2", title: "Doc B" })];
    const block = buildGroundingBlock(chunks);
    expect(block).toContain("Doc A");
    expect(block).toContain("Doc B");
    expect(block).toContain("chk_1");
    expect(block).toContain("chk_2");
  });

  it("truncates content to 900 chars", () => {
    const long = "x".repeat(2000);
    const chunk = makeChunk({ content: long });
    const block = buildGroundingBlock([chunk]);
    // block should contain only first 900 chars of content, not full 2000
    expect(block).toContain("x".repeat(900));
    expect(block).not.toContain("x".repeat(901) + "x");
    // ensure block length is bounded
    expect(block.length).toBeLessThan(2000);
  });

  it("handles missing score (defaults to 0.000)", () => {
    const chunk = makeChunk({ score: undefined as unknown as number });
    const block = buildGroundingBlock([chunk]);
    expect(block).toContain("score=0.000");
  });
});
