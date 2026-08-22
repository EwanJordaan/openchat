import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { AgentContext, ToolResult } from "@/lib/agent/types";

export const listDocumentsSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().max(300).optional(),
});

export const listDocumentsTool = {
  name: "list_documents",
  description: "List documents in a project, optionally filtered by title query.",
  schema: listDocumentsSchema,
  async execute(
    input: z.infer<typeof listDocumentsSchema>,
    _ctx: AgentContext,
  ): Promise<ToolResult> {
    void _ctx;
    try {
      const db = getDb();
      const provider = env.DATABASE_PROVIDER;
      const rows =
        provider === "mysql"
          ? await listDocumentsMysql(db, input)
          : await listDocumentsPg(db, input);
      return { ok: true, output: JSON.stringify(rows.slice(0, 50), null, 2) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // graceful fallback if DB unavailable
      if (msg.toLowerCase().includes("connect") || msg.toLowerCase().includes("not found")) {
        return { ok: true, output: "[]", error: `DB unavailable, returning empty: ${msg}` };
      }
      return { ok: false, output: "", error: msg };
    }
  },
};

async function listDocumentsPg(
  db: ReturnType<typeof getDb>,
  input: z.infer<typeof listDocumentsSchema>,
) {
  if (input.query) {
    const like = `%${input.query}%`;
    return db.query<{
      id: string;
      title: string;
      status: string;
      source_type: string;
      updated_at: string;
    }>(
      sql`select id, title, status, source_type, updated_at from documents where project_id = ${input.projectId} and title ilike ${like} order by updated_at desc limit 50`,
    );
  }
  return db.query<{
    id: string;
    title: string;
    status: string;
    source_type: string;
    updated_at: string;
  }>(
    sql`select id, title, status, source_type, updated_at from documents where project_id = ${input.projectId} order by updated_at desc limit 50`,
  );
}

async function listDocumentsMysql(
  db: ReturnType<typeof getDb>,
  input: z.infer<typeof listDocumentsSchema>,
) {
  if (input.query) {
    const like = `%${input.query}%`;
    return db.query<{
      id: string;
      title: string;
      status: string;
      source_type: string;
      updated_at: string;
    }>(
      sql`select id, title, status, source_type, updated_at from documents where project_id = ${input.projectId} and title like ${like} order by updated_at desc limit 50`,
    );
  }
  return db.query<{
    id: string;
    title: string;
    status: string;
    source_type: string;
    updated_at: string;
  }>(
    sql`select id, title, status, source_type, updated_at from documents where project_id = ${input.projectId} order by updated_at desc limit 50`,
  );
}
