import { z } from "zod";
import type { AgentContext, ToolResult } from "@/lib/agent/types";
import { retrieve } from "@/lib/agent/retrieval";

export const searchDocumentsSchema = z.object({
  query: z.string().min(1).max(1000),
  collectionIds: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional().default(8),
});

export const searchDocumentsTool = {
  name: "search_documents",
  description: "Search document chunks via hybrid vector + keyword search. Returns grounded chunks with citations.",
  schema: searchDocumentsSchema,
  async execute(
    input: z.infer<typeof searchDocumentsSchema>,
    _ctx: AgentContext,
  ): Promise<ToolResult> {
    const projectId = input.projectId ?? input.collectionIds?.[0] ?? _ctx.projectId ?? null;
    try {
      const chunks = await retrieve({
        query: input.query,
        projectId: projectId ?? undefined,
        topK: input.topK ?? 8,
      });
      if (chunks.length === 0) {
        return { ok: true, output: `No chunks found for query "${input.query}"` };
      }
      const output = chunks
        .map((c) => `[Doc: ${c.title} p${c.page ?? "?"} score ${(c.score ?? 0).toFixed(3)} id=${c.chunkId}] ${c.content.slice(0, 600)}`)
        .join("\n\n");
      return {
        ok: true,
        output,
        citations: chunks.map((c) => ({
          chunkId: c.chunkId,
          documentId: c.documentId,
          title: c.title,
          page: c.page ?? null,
          score: c.score,
          excerpt: c.content.slice(0, 300),
        })),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: "", error: msg };
    }
  },
};
