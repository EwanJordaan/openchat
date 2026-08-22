import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { createProject, listProjects } from "@/lib/db/store";
import { attachActorCookies, jsonError, jsonOk } from "@/lib/http";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  visibility: z.enum(["private", "public"]).optional(),
});

export async function GET() {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const projects = await listProjects(actor);
  return attachActorCookies(jsonOk({ projects }), { actor, needsGuestCookie, needsSessionCleanup });
}

export async function POST(req: Request) {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return attachActorCookies(jsonError("Invalid JSON", 400), { actor, needsGuestCookie, needsSessionCleanup });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), { actor, needsGuestCookie, needsSessionCleanup });
  const proj = await createProject(actor, parsed.data.title.trim(), parsed.data.description ?? null, parsed.data.visibility);
  return attachActorCookies(jsonOk({ project: proj }, { status: 201 } as ResponseInit), { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
