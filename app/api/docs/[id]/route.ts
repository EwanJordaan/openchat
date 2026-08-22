import { sql } from "drizzle-orm";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getDb } from "@/lib/db/client";
import { getDocument } from "@/lib/db/store";
import { deleteObject } from "@/lib/storage/s3";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const { id } = await ctx.params;
  const doc = await getDocument(actor, id);
  if (!doc) {
    return attachActorCookies(jsonError("Document not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const url = new URL(req.url);
  const withChunks = url.searchParams.get("chunks") === "1" || url.searchParams.get("query") !== null;
  const q = url.searchParams.get("query")?.trim() || "";
  let chunks: unknown[] = [];
  if (withChunks) {
    const { query } = getDb();
    if (q) {
      const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      chunks = await query(sql`select id, document_id, ordinal, heading, page, char_offset, content, token_count from document_chunks where document_id = ${id} and content like ${like} order by ordinal asc limit 50`);
    } else {
      chunks = await query(sql`select id, document_id, ordinal, heading, page, char_offset, content, token_count from document_chunks where document_id = ${id} order by ordinal asc limit 100`);
    }
  }
  const res = jsonOk({ document: doc, chunks });
  return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const { id } = await ctx.params;
  const doc = await getDocument(actor, id);
  if (!doc) {
    return attachActorCookies(jsonError("Document not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const { query } = getDb();
  await query(sql`delete from document_chunks where document_id = ${id}`);
  await query(sql`delete from documents where id = ${id}`);
  if (doc.storageKey) {
    await deleteObject(doc.storageKey).catch(() => undefined);
  }
  const res = jsonOk({ deleted: true, id });
  return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
