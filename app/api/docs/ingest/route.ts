import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getDocument } from "@/lib/db/store";
import { processOne } from "@/workers/ingest";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

export async function POST(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  let body: { documentId?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const documentId = body.documentId ? String(body.documentId).trim() : "";
  if (documentId) {
    const doc = await getDocument(actor, documentId);
    if (!doc) {
      return attachActorCookies(jsonError("Document not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
    }
    void processOne(documentId).catch(() => undefined);
    return attachActorCookies(jsonOk({ status: "queued", documentId }), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const res = jsonOk({ status: "triggered" });
  return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
}

export async function GET() {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const { ingestDocument: ingest } = await import("@/lib/docs/index");
  void ingest;
  const res = jsonOk({ status: "ok", worker: "polling every 5s via startIngestWorker" });
  return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
