import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const webSearchSchema = z.object({
  query: z.string().min(1).max(500),
  count: z.number().int().min(1).max(10).optional().default(5),
});

export const webSearchTool = {
  name: "web_search",
  description: "Search the web for factual information. Returns titles and excerpts.",
  schema: webSearchSchema,
  async execute(input: z.infer<typeof webSearchSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    return {
      ok: true,
      output: `Web search stub — integrate Tavily later. Query was: "${input.query}" (count=${input.count ?? 5}). No live results in phase 2.`,
    };
  },
};
