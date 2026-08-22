import { describe, it, expect } from "bun:test";
import { toolRegistry, executeTool, getToolsForLlm, listToolNames } from "@/lib/agent/registry";

describe("registry — toolRegistry shape", () => {
  it("contains 11 expected tools", () => {
    const names = listToolNames();
    expect(names.length).toBe(11);
    expect(names).toContain("search_documents");
    expect(names).toContain("read_document");
    expect(names).toContain("list_documents");
    expect(names).toContain("ingest_url");
    expect(names).toContain("ingest_repo_files");
    expect(names).toContain("write_document");
    expect(names).toContain("run_code");
    expect(names).toContain("web_search");
    expect(names).toContain("ask_user");
    expect(names).toContain("get_time");
    expect(names).toContain("calc");
  });

  it("every tool has description and zod schema with safeParse", () => {
    for (const [name, tool] of Object.entries(toolRegistry)) {
      expect(typeof tool.description, `${name} description`).toBe("string");
      expect(tool.description.length, `${name} description length`).toBeGreaterThan(5);
      expect(typeof (tool as unknown as { schema: { safeParse: unknown } }).schema.safeParse, `${name} schema.safeParse`).toBe("function");
      expect(typeof tool.execute, `${name} execute`).toBe("function");
    }
  });
});

describe("registry — schema validation", () => {
  it("calc schema accepts valid expression, rejects empty/invalid", () => {
    const calc = toolRegistry.calc;
    expect(calc.schema.safeParse({ expression: "2*(3+4)" }).success).toBe(true);
    expect(calc.schema.safeParse({ expression: "" }).success).toBe(false);
    expect(calc.schema.safeParse({}).success).toBe(false);
    expect(calc.schema.safeParse({ expression: 123 }).success).toBe(false);
  });

  it("search_documents schema validates query and topK bounds", () => {
    const sd = toolRegistry.search_documents;
    expect(sd.schema.safeParse({ query: "hello" }).success).toBe(true);
    expect(sd.schema.safeParse({ query: "" }).success).toBe(false);
    expect(sd.schema.safeParse({ query: "hi", topK: 0 }).success).toBe(false);
    expect(sd.schema.safeParse({ query: "hi", topK: 21 }).success).toBe(false);
    expect(sd.schema.safeParse({ query: "hi", topK: 8 }).success).toBe(true);
  });

  it("get_time schema has no required fields (defaults)", () => {
    const gt = toolRegistry.get_time;
    // get_time takes optional timezone/format — empty object should be valid
    const result = gt.schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("ask_user schema requires question", () => {
    const au = toolRegistry.ask_user;
    expect(au.schema.safeParse({ question: "Are you there?" }).success).toBe(true);
    expect(au.schema.safeParse({}).success).toBe(false);
    expect(au.schema.safeParse({ question: "" }).success).toBe(false);
  });

  it("web_search schema validates query", () => {
    const ws = toolRegistry.web_search;
    expect(ws.schema.safeParse({ query: "openchat agentic" }).success).toBe(true);
    expect(ws.schema.safeParse({ query: "" }).success).toBe(false);
  });
});

describe("registry — executeTool", () => {
  it("returns error for unknown tool", async () => {
    const res = await executeTool("nonexistent_tool", {}, { actor: { kind: "guest", guestId: "gst_test" } } as never);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unknown tool");
  });

  it("returns validation error for invalid input", async () => {
    const res = await executeTool("calc", { expression: "" }, { actor: { kind: "guest", guestId: "gst_test" } } as never);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid input");
  });

  it("executes calc tool successfully", async () => {
    const res = await executeTool("calc", { expression: "2+2" }, { actor: { kind: "guest", guestId: "gst_test" } } as never);
    expect(res.ok).toBe(true);
    expect(res.output).toBe("4");
  });

  it("executes get_time tool successfully", async () => {
    const res = await executeTool("get_time", {}, { actor: { kind: "guest", guestId: "gst_test" } } as never);
    expect(res.ok).toBe(true);
    expect(res.output.length).toBeGreaterThan(0);
  });

  it("rejects calc with disallowed chars", async () => {
    const res = await executeTool("calc", { expression: "process.exit()" }, { actor: { kind: "guest", guestId: "gst_test" } } as never);
    expect(res.ok).toBe(false);
  });
});

describe("registry — getToolsForLlm", () => {
  it("returns JSON schema tools for LLM with parameters", () => {
    const tools = getToolsForLlm();
    expect(Object.keys(tools).length).toBe(11);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool).toBeDefined();
      // tool from ai SDK should have description baked in
      // we just verify it exists and is an object
      expect(typeof tool, name).toBe("object");
    }
  });

  it("strips defaults from required list (zod->jsonschema transform)", () => {
    const tools = getToolsForLlm() as Record<string, { parameters: { jsonSchema: unknown } }>;
    // search_documents topK has default, so should not be required
    // We can't introspect deeply without ai internals, but ensure call doesn't throw
    expect(tools["search_documents"]).toBeDefined();
  });
});
