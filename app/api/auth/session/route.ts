import { NextResponse } from "next/server";

import { resolveActor } from "@/lib/auth/session";
import { getPublicAppSettings, listModelsForActor } from "@/lib/db/store";
import { attachActorCookies } from "@/lib/http";

export async function GET() {
  const resolved = await resolveActor();
  const settings = await getPublicAppSettings();
  const models = await listModelsForActor(resolved.actor);

  const response = NextResponse.json({
    actor: resolved.actor,
    settings,
    models,
  });

  return attachActorCookies(response, resolved);
}
