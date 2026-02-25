import { NextResponse } from "next/server";

import { resolveActor, resolveGuestActorFromCookies } from "@/lib/auth/session";
import { getPublicAppSettings, listModelsForActor } from "@/lib/db/store";
import { attachActorCookies } from "@/lib/http";

export async function GET() {
  try {
    const resolved = await resolveActor();
    const settings = await getPublicAppSettings();
    const models = await listModelsForActor(resolved.actor);

    const response = NextResponse.json({
      actor: resolved.actor,
      settings,
      models,
      degraded: false,
    });

    return attachActorCookies(response, resolved);
  } catch (error) {
    const resolved = await resolveGuestActorFromCookies();
    const response = NextResponse.json({
      actor: resolved.actor,
      settings: {
        guestEnabled: true,
        guestAllowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
        defaultModelId: "gpt-4o-mini",
      },
      models: [
        {
          id: "gpt-4o-mini",
          displayName: "GPT-4o mini",
          provider: "openai",
          description: "Fast, lightweight model for most tasks",
          isEnabled: true,
          isDefault: true,
          isGuestAllowed: true,
          maxOutputTokens: 2048,
        },
        {
          id: "gpt-4.1-mini",
          displayName: "GPT-4.1 mini",
          provider: "openai",
          description: "Balanced quality and speed",
          isEnabled: true,
          isDefault: false,
          isGuestAllowed: true,
          maxOutputTokens: 4096,
        },
      ],
      degraded: true,
      error:
        error instanceof Error
          ? error.message
          : "Database is unavailable. Check DATABASE_URL and provider network access.",
    });
    return attachActorCookies(response, resolved);
  }
}
