import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { listModelsForActor } from "@/lib/db/store";
import { attachActorCookies, jsonOk } from "@/lib/http";

export async function GET() {
  await ensureDatabase();
  const { actor, needsGuestCookie, needsSessionCleanup } = await resolveActor();
  const models = await listModelsForActor(actor);
  return attachActorCookies(jsonOk({ models }), { actor, needsGuestCookie, needsSessionCleanup });
}

export const dynamic = "force-dynamic";
