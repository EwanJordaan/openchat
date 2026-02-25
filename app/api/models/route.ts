import { NextResponse } from "next/server";

import { resolveActor } from "@/lib/auth/session";
import { listModelsForActor } from "@/lib/db/store";
import { attachActorCookies } from "@/lib/http";

export async function GET() {
  const resolved = await resolveActor();
  const models = await listModelsForActor(resolved.actor);
  const response = NextResponse.json({ models });
  return attachActorCookies(response, resolved);
}
