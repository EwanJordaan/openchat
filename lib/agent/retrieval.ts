import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { embedQuery } from "@/lib/llm/embed";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  projectId: string | null;
  content: string;
  page: number | null;
  heading: string | null;
  ordinal: number;
  title: string;
  distance: number;
  score: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  project_id: string | null;
  content: string;
  page: number | null;
  heading: string | null;
  ordinal: number;
  distance: number;
  title: string;
}

export async function retrieve(opts: {
  query: string;
  projectId?: string | null;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 12;
  if (!opts.query.trim()) return [];

  let queryVector: number[] | null = null;
  try {
    queryVector = await embedQuery(opts.query);
  } catch {
    queryVector = null;
  }

  const db = getDb();
  const provider = env.DATABASE_PROVIDER;

  // MySQL fallback — LIKE search
  if (provider === "mysql") {
    return retrieveMysql(db, opts.query, opts.projectId, topK);
  }

  // Postgres: try vector search if we have a vector
  if (queryVector && queryVector.length > 0) {
    const chunks = await retrievePgVector(db, opts.query, queryVector, opts.projectId, topK).catch(() => null);
    if (chunks && chunks.length > 0) {
      // fallback to keyword if best distance is poor (>0.78 cosine distance)
      const best = Math.min(...chunks.map((c) => c.distance));
      if (best <= 0.78) return chunks;
      // else fall through to keyword fallback and merge
      const keyword = await retrievePgKeyword(db, opts.query, opts.projectId, topK).catch(() => []);
      // merge: prefer vector but include keyword extras not already present
      const seen = new Set(chunks.map((c) => c.chunkId));
      for (const k of keyword) {
        if (!seen.has(k.chunkId)) chunks.push(k);
        if (chunks.length >= topK) break;
      }
      return chunks.slice(0, topK);
    }
  }

  // fallback keyword
  try {
    const kw = await retrievePgKeyword(db, opts.query, opts.projectId, topK);
    if (kw.length > 0) return kw;
  } catch {
    // ignore
  }

  // last resort: like search
  try {
    return await retrievePgLike(db, opts.query, opts.projectId, topK);
  } catch {
    return [];
  }
}

async function retrievePgVector(
  db: ReturnType<typeof getDb>,
  _query: string,
  queryVector: number[],
  projectId: string | null | undefined,
  topK: number,
): Promise<RetrievedChunk[]> {
  const vecLiteral = `[${queryVector.join(",")}]`;
  const rows = projectId
    ? await db.query<ChunkRow>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, (dc.embedding <=> ${vecLiteral}::vector) as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.project_id = ${projectId} order by distance asc limit ${topK}`,
      )
    : await db.query<ChunkRow>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, (dc.embedding <=> ${vecLiteral}::vector) as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id order by distance asc limit ${topK}`,
      );

  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    projectId: r.project_id,
    content: r.content,
    page: r.page,
    heading: r.heading,
    ordinal: r.ordinal,
    title: r.title ?? "Untitled",
    distance: Number(r.distance ?? 1),
    score: 1 - Number(r.distance ?? 1),
  }));
}

async function retrievePgKeyword(
  db: ReturnType<typeof getDb>,
  query: string,
  projectId: string | null | undefined,
  topK: number,
): Promise<RetrievedChunk[]> {
  const rows = projectId
    ? await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.project_id = ${projectId} and dc.tsv @@ plainto_tsquery('english', ${query}) order by ts_rank(dc.tsv, plainto_tsquery('english', ${query})) desc limit ${topK}`,
      )
    : await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.tsv @@ plainto_tsquery('english', ${query}) order by ts_rank(dc.tsv, plainto_tsquery('english', ${query})) desc limit ${topK}`,
      );
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    projectId: r.project_id,
    content: r.content,
    page: r.page,
    heading: r.heading,
    ordinal: r.ordinal,
    title: r.title ?? "Untitled",
    distance: 0.5,
    score: 0.5,
  }));
}

async function retrievePgLike(
  db: ReturnType<typeof getDb>,
  query: string,
  projectId: string | null | undefined,
  topK: number,
): Promise<RetrievedChunk[]> {
  const like = `%${query.slice(0, 80)}%`;
  const rows = projectId
    ? await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.project_id = ${projectId} and dc.content ilike ${like} order by dc.ordinal asc limit ${topK}`,
      )
    : await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.content ilike ${like} order by dc.ordinal asc limit ${topK}`,
      );
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    projectId: r.project_id,
    content: r.content,
    page: r.page,
    heading: r.heading,
    ordinal: r.ordinal,
    title: r.title ?? "Untitled",
    distance: 0.6,
    score: 0.4,
  }));
}

async function retrieveMysql(
  db: ReturnType<typeof getDb>,
  query: string,
  projectId: string | null | undefined,
  topK: number,
): Promise<RetrievedChunk[]> {
  const like = `%${query.slice(0, 80)}%`;
  const rows = projectId
    ? await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.project_id = ${projectId} and dc.content like ${like} order by dc.ordinal asc limit ${topK}`,
      )
    : await db.query<ChunkRow & { distance: number }>(
        sql`select dc.id, dc.document_id, dc.project_id, dc.content, dc.page, dc.heading, dc.ordinal, 0 as distance, d.title from document_chunks dc join documents d on d.id = dc.document_id where dc.content like ${like} order by dc.ordinal asc limit ${topK}`,
      );
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    projectId: r.project_id,
    content: r.content,
    page: r.page,
    heading: r.heading,
    ordinal: r.ordinal,
    title: r.title ?? "Untitled",
    distance: 0.6,
    score: 0.4,
  }));
}

export function buildGroundingBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const lines = chunks.map((c) => {
    const pagePart = c.page ? ` p${c.page}` : "";
    const headPart = c.heading ? ` heading="${c.heading}"` : "";
    return `[Doc: ${c.title}${pagePart} chunk=${c.chunkId}${headPart} score=${(c.score ?? 0).toFixed(3)}]\n${c.content.slice(0, 900)}`;
  });
  return `<grounding>\n${lines.join("\n\n")}\n</grounding>`;
}
