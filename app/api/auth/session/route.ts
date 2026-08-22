import { resolveActor, resolveGuestActorFromCookies } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
import { getPublicAppSettings, listModelsForActor } from "@/lib/db/store";
import { attachActorCookies, jsonOk } from "@/lib/http";

export async function GET() {
  try {
    await ensureDatabase();
    const resolved = await resolveActor();
    const settings = await getPublicAppSettings();
    const models = await listModelsForActor(resolved.actor);
    return attachActorCookies(jsonOk({ actor: resolved.actor, settings, models, degraded: false }), resolved);
  } catch (e) {
    const fallback = await resolveGuestActorFromCookies();
    const msg = e instanceof Error ? e.message : "Database unavailable";
    return attachActorCookies(
      jsonOk({
        actor: fallback.actor,
        settings: { guestEnabled: true, guestAllowedModels: ["gpt-4o-mini"], defaultModelId: "gpt-4o-mini" },
        models: [{ id: "gpt-4o-mini", displayName: "GPT-4o mini", provider: "openai", description: "Fallback", isEnabled: true, isDefault: true, isGuestAllowed: true, maxOutputTokens: 2048 }],
        degraded: true,
        error: msg,
      }),
      fallback,
    );
  }
}

export const dynamic = "force-dynamic";
