import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { createId, nowIso } from "@/lib/utils";
import type { Actor } from "@/lib/types";
import { presignUpload } from "@/lib/storage/s3";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export async function createPresignedDocument(opts: {
  projectId: string;
  filename: string;
  mime: string;
  size?: number;
  actor: Actor;
}): Promise<{ documentId: string; key: string; url: string; fields?: Record<string, string>; presignedUrl?: string }> {
  const { projectId, filename, mime, actor } = opts;
  const docId = createId("doc");
  const safe = sanitizeFilename(filename);
  const key = `projects/${projectId}/${docId}-${safe}`;
  const now = nowIso();

  const db = getDb();
  const title = filename || safe;
  const ownerUserId = actor.type === "user" ? actor.userId : null;
  const guestId = actor.guestId;

  await db.query(sql`
    insert into documents (id, project_id, owner_user_id, guest_id, title, source_type, source_url, mime_type, storage_key, sha256, page_count, token_count, status, error, created_at, updated_at)
    values (${docId}, ${projectId}, ${ownerUserId}, ${guestId}, ${title}, ${"file"}, ${null}, ${mime || "application/octet-stream"}, ${key}, ${null}, ${null}, ${null}, ${"pending"}, ${null}, ${now}, ${now})
  `);

  const presigned = await presignUpload({ key, mime: mime || "application/octet-stream" });

  if ("url" in presigned) {
    return { documentId: docId, key, url: presigned.url, fields: presigned.fields };
  }
  return { documentId: docId, key, url: presigned.presignedUrl, presignedUrl: presigned.presignedUrl };
}
