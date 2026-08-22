import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getProject } from "@/lib/db/store";
import { createPresignedDocument } from "@/lib/storage/presign";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

export async function POST(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  let body: { projectId?: string; filename?: string; mime?: string; sizeBytes?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const projectId = String(body.projectId || "").trim();
  const filename = String(body.filename || "file").trim();
  const mime = String(body.mime || "application/octet-stream").trim();
  if (!projectId) {
    return attachActorCookies(jsonError("projectId required", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const project = await getProject(actor, projectId);
  if (!project) {
    return attachActorCookies(jsonError("Project not found or access denied", 404), { actor, needsGuestCookie, needsSessionCleanup });
  }
  if (filename.length > 255) {
    return attachActorCookies(jsonError("filename too long", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  try {
    const result = await createPresignedDocument({ projectId, filename, mime, size: body.sizeBytes, actor });
    const res = jsonOk(result);
    return attachActorCookies(res, { actor, needsGuestCookie, needsSessionCleanup });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "presign failed";
    return attachActorCookies(jsonError(msg, 500), { actor, needsGuestCookie, needsSessionCleanup });
  }
}

// Ensure route is dynamic
export const dynamic = "force-dynamic";
