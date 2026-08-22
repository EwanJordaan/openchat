import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const readDocumentSchema = z.object({
  documentId: z.string().min(1),
  pageFrom: z.number().int().min(1).optional(),
  pageTo: z.number().int().min(1).optional(),
});

export const readDocumentTool = {
  name: "read_document",
  description: "Read a document's content by documentId, optionally paginated by pageFrom/pageTo.",
  schema: readDocumentSchema,
  async execute(
    input: z.infer<typeof readDocumentSchema>,
    _ctx: AgentContext,
  ): Promise<ToolResult> {
    void _ctx;
    try {
      const db = getDb();
      const docs = await db.query<{ id: string; title: string; status: string; page_count: number | null }>(
        sql`select id, title, status, page_count from documents where id = ${input.documentId} limit 1`,
      );
      const doc = docs[0];
      if (!doc) return { ok: false, output: "", error: `Document ${input.documentId} not found` };

      let pageFilter = sql``;
      if (input.pageFrom && input.pageTo) {
        pageFilter = sql` and page >= ${input.pageFrom} and page <= ${input.pageTo}`;
      } else if (input.pageFrom) {
        pageFilter = sql` and page >= ${input.pageFrom}`;
      } else if (input.pageTo) {
        pageFilter = sql` and page <= ${input.pageTo}`;
      }

      const chunks = await db.query<{
        id: string;
        ordinal: number;
        page: number | null;
        heading: string | null;
        content: string;
      }>(
        sql`select id, ordinal, page, heading, content from document_chunks where document_id = ${input.documentId}${pageFilter} order by ordinal asc limit 40`,
      );

      if (chunks.length === 0) {
        return { ok: true, output: `Document "${doc.title}" (${doc.id}) has no chunks yet. Status: ${doc.status}` };
      }

      const text = chunks
        .map((c) => {
          const head = c.heading ? `## ${c.heading}\n` : "";
          const pageTag = c.page ? ` [p${c.page}]` : "";
          return `${head}${c.content}${pageTag}`;
        })
        .join("\n\n---\n\n")
        .slice(0, 12000);

      return {
        ok: true,
        output: `Document: ${doc.title} (${doc.id}) pages ${input.pageFrom ?? 1}-${input.pageTo ?? doc.page_count ?? "?"}\n\n${text}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: "", error: msg };
    }
  },
};
