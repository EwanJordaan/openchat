import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const writeDocumentSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(300),
  markdown: z.string().min(1).max(50000),
});

export const writeDocumentTool = {
  name: "write_document",
  description: "Create a new derived document in a project collection. Requires projectId, title, markdown body.",
  schema: writeDocumentSchema,
  async execute(input: z.infer<typeof writeDocumentSchema>, _ctx: AgentContext): Promise<ToolResult> {
    void _ctx;
    // Phase 2 stub: S3/write not yet implemented
    return {
      ok: true,
      output: `write_document stub — would create document "${input.title}" in project ${input.projectId} (${input.markdown.length} chars). Integrate storage + chunking pipeline later.`,
    };
  },
};
