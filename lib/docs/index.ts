import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { getObject } from "@/lib/storage/s3";
import { parseDocument } from "@/lib/docs/parse";
import { chunkText } from "@/lib/docs/chunk";
import { embedChunks } from "@/lib/docs/embed";
import { createId, nowIso } from "@/lib/utils";

type DocRow = {
  id: string;
  project_id: string | null;
  storage_key: string | null;
  mime_type: string | null;
  title: string;
  status: string;
};

async function setStatus(documentId: string, status: string, error: string | null = null, extra: Record<string, unknown> = {}) {
  const { query } = getDb();
  const now = nowIso();
  const errVal = error ? error.slice(0, 2000) : null;
  if (extra.page_count != null) {
    await query(sql`update documents set status = ${status}, error = ${errVal}, page_count = ${extra.page_count as number}, token_count = ${extra.token_count as number}, updated_at = ${now} where id = ${documentId}`);
    return;
  }
  await query(sql`update documents set status = ${status}, error = ${errVal}, updated_at = ${now} where id = ${documentId}`);
}

export async function ingestDocument(documentId: string): Promise<void> {
  const { query, provider } = getDb();
  const rows = await query<DocRow>(sql`select id, project_id, storage_key, mime_type, title, status from documents where id = ${documentId} limit 1`);
  const doc = rows[0];
  if (!doc) throw new Error(`document ${documentId} not found`);
  if (!doc.storage_key) {
    await setStatus(documentId, "failed", "missing storage_key");
    return;
  }

  try {
    await setStatus(documentId, "parsing");
    const buffer = await getObject(doc.storage_key);
    const parsed = await parseDocument({ buffer, mime: doc.mime_type || "application/octet-stream", filename: doc.title || doc.storage_key });

    await setStatus(documentId, "chunking", null, { page_count: parsed.pageCount, token_count: parsed.tokenEstimate });

    const chunks = chunkText({ markdown: parsed.markdown, pageMap: parsed.pages, pageCount: parsed.pageCount });

    if (chunks.length === 0) {
      await query(sql`delete from document_chunks where document_id = ${documentId}`);
      await setStatus(documentId, "ready", null, { page_count: parsed.pageCount, token_count: parsed.tokenEstimate });
      return;
    }

    await query(sql`delete from document_chunks where document_id = ${documentId}`);
    for (const ch of chunks) {
      const cid = createId("chk");
      const tsv = ch.content.slice(0, 4000).replace(/'/g, "''");
      if (provider === "mysql") {
        await query(sql`
          insert into document_chunks (id, document_id, project_id, ordinal, heading, page, char_offset, content, tsv, embedding, token_count)
          values (${cid}, ${documentId}, ${doc.project_id}, ${ch.ordinal}, ${ch.heading}, ${ch.page}, ${ch.charOffset}, ${ch.content}, ${tsv}, ${null}, ${ch.tokenCount})
        `);
      } else {
        await query(sql`
          insert into document_chunks (id, document_id, project_id, ordinal, heading, page, char_offset, content, tsv, embedding, token_count)
          values (${cid}, ${documentId}, ${doc.project_id}, ${ch.ordinal}, ${ch.heading}, ${ch.page}, ${ch.charOffset}, ${ch.content}, ${sql.raw(`to_tsvector('english', '${tsv}')`)}, ${null}, ${ch.tokenCount})
        `);
      }
    }

    await setStatus(documentId, "embedding");

    const batchSize = 96;
    const chunkRows = await query<{ id: string; content: string }>(
      sql`select id, content from document_chunks where document_id = ${documentId} order by ordinal asc`,
    );

    for (let i = 0; i < chunkRows.length; i += batchSize) {
      const batch = chunkRows.slice(i, i + batchSize);
      const texts = batch.map((r) => r.content);
      const embeddings = await embedChunks(texts);
      for (let j = 0; j < batch.length; j++) {
        const emb = embeddings[j];
        if (!emb) continue;
        const vecLiteral = `[${emb.join(",")}]`;
        if (provider === "mysql") {
          const json = JSON.stringify(emb);
          await query(sql`update document_chunks set embedding = ${json} where id = ${batch[j].id}`);
        } else {
          await query(sql`update document_chunks set embedding = ${vecLiteral}::vector where id = ${batch[j].id}`);
        }
      }
    }

    await setStatus(documentId, "ready", null, { page_count: parsed.pageCount, token_count: parsed.tokenEstimate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setStatus(documentId, "failed", msg);
    throw e;
  }
}
