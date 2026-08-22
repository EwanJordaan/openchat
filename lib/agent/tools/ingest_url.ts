import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const ingestUrlSchema = z.object({
  url: z.string().url().max(2048),
  projectId: z.string().min(1),
});

export const ingestUrlTool = {
  name: "ingest_url",
  description: "Ingest a URL into a project: fetch, parse, chunk, embed. Returns docId when done.",
  schema: ingestUrlSchema,
  async execute(input: z.infer<typeof ingestUrlSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    return {
      ok: true,
      output: `ingest_url stub — would fetch ${input.url} into project ${input.projectId}. Integrate fetch + readability + chunk pipeline later.`,
    };
  },
};
