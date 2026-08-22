import { jsonSchema, tool } from "ai";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

import { calcTool } from "@/lib/agent/tools/calc";
import { getTimeTool } from "@/lib/agent/tools/get_time";
import { askUserTool } from "@/lib/agent/tools/ask_user";
import { webSearchTool } from "@/lib/agent/tools/web_search";
import { runCodeTool } from "@/lib/agent/tools/run_code";
import { writeDocumentTool } from "@/lib/agent/tools/write_document";
import { ingestUrlTool } from "@/lib/agent/tools/ingest_url";
import { ingestRepoFilesTool } from "@/lib/agent/tools/ingest_repo_files";
import { listDocumentsTool } from "@/lib/agent/tools/list_documents";
import { readDocumentTool } from "@/lib/agent/tools/read_document";
import { searchDocumentsTool } from "@/lib/agent/tools/search_documents";

// Barrel re-exports for tool modules
export * from "@/lib/agent/tools/calc";
export * from "@/lib/agent/tools/get_time";
export * from "@/lib/agent/tools/ask_user";
export * from "@/lib/agent/tools/web_search";
export * from "@/lib/agent/tools/run_code";
export * from "@/lib/agent/tools/write_document";
export * from "@/lib/agent/tools/ingest_url";
export * from "@/lib/agent/tools/ingest_repo_files";
export * from "@/lib/agent/tools/list_documents";
export * from "@/lib/agent/tools/read_document";
export * from "@/lib/agent/tools/search_documents";

export const toolRegistry = {
  search_documents: searchDocumentsTool,
  read_document: readDocumentTool,
  list_documents: listDocumentsTool,
  ingest_url: ingestUrlTool,
  ingest_repo_files: ingestRepoFilesTool,
  write_document: writeDocumentTool,
  run_code: runCodeTool,
  web_search: webSearchTool,
  ask_user: askUserTool,
  get_time: getTimeTool,
  calc: calcTool,
} as const;

export type ToolName = keyof typeof toolRegistry;

export async function executeTool(name: string, input: unknown, ctx: AgentContext): Promise<ToolResult> {
  const tool = (toolRegistry as Record<string, { schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { message: string } } }; execute: (data: unknown, ctx: AgentContext) => Promise<ToolResult> }>)[name];
  if (!tool) {
    return { ok: false, output: "", error: `Unknown tool: ${name}` };
  }
  const parsed = tool.schema.safeParse(input) as unknown as { success: boolean; data?: unknown; error?: { message: string } };
  if (!parsed.success) {
    return { ok: false, output: "", error: `Invalid input for ${name}: ${parsed.error?.message ?? "validation failed"}` };
  }
  try {
    return await tool.execute(parsed.data as never, ctx);
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : String(e) };
  }
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const zodAny = schema as { toJSONSchema?: () => Record<string, unknown> };
  let raw: Record<string, unknown> | null = null;
  if (zodAny.toJSONSchema) {
    raw = zodAny.toJSONSchema();
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { z } = require("zod") as { z: { toJSONSchema: (s: unknown) => Record<string, unknown> } };
      raw = z.toJSONSchema(schema);
    } catch {
      return { type: "object", properties: {} } as Record<string, unknown>;
    }
  }
  if (!raw || typeof raw !== "object") return { type: "object", properties: {} };
  const { $schema, ...rest } = raw as Record<string, unknown> & { $schema?: string };
  void $schema;
  const required = rest["required"] as string[] | undefined;
  const properties = rest["properties"] as Record<string, Record<string, unknown>> | undefined;
  if (Array.isArray(required) && properties) {
    const filtered = required.filter((k) => {
      const prop = properties[k];
      return !(prop && "default" in prop);
    });
    if (filtered.length === 0) delete (rest as Record<string, unknown>)["required"];
    else (rest as Record<string, unknown>)["required"] = filtered;
  }
  return rest;
}

export function getToolsForLlm(): Record<string, ReturnType<typeof tool>> {
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const [key, t] of Object.entries(toolRegistry)) {
    const raw = zodToJsonSchema(t.schema);
    out[key] = tool({
      description: t.description,
      parameters: jsonSchema(raw as never),
    }) as ReturnType<typeof tool>;
  }
  return out;
}

export function listToolNames(): string[] {
  return Object.keys(toolRegistry);
}
