import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { deleteProject, getProject, updateProject } from "@/lib/db/store";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  visibility: z.enum(["private", "public"]).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const proj = await getProject(actor, id);
  if (!proj) return attachActorCookies(jsonError("Project not found", 404), { actor, needsGuestCookie, needsSessionCleanup });
  return attachActorCookies(jsonOk({ project: proj }), { actor, needsGuestCookie, needsSessionCleanup });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), { actor, needsGuestCookie, needsSessionCleanup });
  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;
  const updated = await updateProject(actor, id, patch as { title?: string; description?: string | null; visibility?: string });
  if (!updated) return attachActorCookies(jsonError("Project not found or not owner", 404), { actor, needsGuestCookie, needsSessionCleanup });
  return attachActorCookies(jsonOk({ project: updated }), { actor, needsGuestCookie, needsSessionCleanup });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await ctx.params;
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const ok = await deleteProject(actor, id);
  if (!ok) return attachActorCookies(jsonError("Project not found or not owner", 404), { actor, needsGuestCookie, needsSessionCleanup });
  return attachActorCookies(jsonOk({ deleted: true, id }), { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
