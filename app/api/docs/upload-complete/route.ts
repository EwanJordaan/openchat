import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getDocument } from "@/lib/db/store";
import { ingestDocument } from "@/lib/docs/index";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

export async function POST(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  let body: { documentId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const documentId = String(body.documentId || "").trim();
  if (!documentId) {
    return attachActorCookies(jsonError("documentId required", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const doc = await getDocument(actor, documentId);
  if (!doc) {
    return attachActorCookies(jsonError("Document not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
  }
  void ingestDocument(documentId).catch(() => undefined);
  const res = jsonOk({ status: "queued", documentId });
  return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
