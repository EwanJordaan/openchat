import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ingestDocument } from "@/lib/docs/index";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function processOne(documentId: string): Promise<void> {
  await ingestDocument(documentId);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { query } = getDb();
    const rows = await query<{ id: string }>(
      sql`select id from documents where status in ('pending','parsing','chunking','embedding') order by updated_at asc limit 5`,
    );
    for (const r of rows) {
      try {
        await ingestDocument(r.id);
      } catch {
        // ingestDocument already marks failed
      }
    }
  } catch {
    // ignore poll errors
  } finally {
    running = false;
  }
}

export async function startIngestWorker(): Promise<() => void> {
  if (timer) return () => stopIngestWorker();
  await tick();
  timer = setInterval(() => {
    void tick();
  }, 5000);
  if (timer && typeof (timer as unknown as { unref?: () => void }).unref === "function") {
    (timer as unknown as { unref: () => void }).unref();
  }
  return () => stopIngestWorker();
}

export function stopIngestWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
