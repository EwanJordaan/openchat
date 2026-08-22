import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { listDocuments } from "@/lib/db/store";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  if (!projectId) {
    return attachActorCookies(jsonError("projectId query required", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  try {
    const docs = await listDocuments(actor, projectId);
    const res = jsonOk({ documents: docs });
    return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed to list";
    return attachActorCookies(jsonError(msg, 500), { actor, needsGuestCookie, needsSessionCleanup });
  }
}

export const dynamic = "force-dynamic";
