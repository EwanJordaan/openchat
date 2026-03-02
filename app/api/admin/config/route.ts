import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import {
  getPublicAppSettings,
  listModels,
  listProviders,
  listRoleLimits,
  listUsersWithRoles,
  logAudit,
  setUserRoles,
  updateModel,
  updatePublicAppSettings,
  upsertProviderCredential,
  upsertRoleLimit,
} from "@/lib/db/store";
import { attachActorCookies, jsonError, requireAdmin } from "@/lib/http";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    payload: z.object({
      guestEnabled: z.boolean().optional(),
      guestAllowedModels: z.array(z.string()).optional(),
      defaultModelId: z.string().optional(),
    }),
  }),
  z.object({
    action: z.literal("provider"),
    payload: z.object({
      provider: z.string().min(2).max(120),
      baseUrl: z.string().url(),
      apiKey: z.string().min(1).max(400).optional(),
      isEnabled: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal("model"),
    payload: z.object({
      id: z.string(),
      displayName: z.string().min(2).max(80).optional(),
      description: z.string().min(2).max(180).optional(),
      isEnabled: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      isGuestAllowed: z.boolean().optional(),
      maxOutputTokens: z.number().int().min(256).max(8192).optional(),
    }),
  }),
  z.object({
    action: z.literal("roleLimit"),
    payload: z.object({
      role: z.enum(["guest", "user", "admin"]),
      dailyMessageLimit: z.number().int().min(1).max(200000),
      maxAttachmentCount: z.number().int().min(0).max(30),
      maxAttachmentMb: z.number().int().min(1).max(200),
    }),
  }),
  z.object({
    action: z.literal("userRoles"),
    payload: z.object({
      userId: z.string(),
      roles: z.array(z.enum(["user", "admin"])).min(1),
    }),
  }),
]);

export async function GET() {
  const resolved = await resolveActor();
  try {
    requireAdmin(resolved.actor);
  } catch {
    return jsonError("Admin access required", 403);
  }

  const [settings, providers, models, roleLimits, users] = await Promise.all([
    getPublicAppSettings(),
    listProviders(),
    listModels(),
    listRoleLimits(),
    listUsersWithRoles(),
  ]);

  const response = NextResponse.json({
    settings,
    providers,
    models,
    roleLimits,
    users,
  });
  return attachActorCookies(response, resolved);
}

export async function PATCH(request: Request) {
  const resolved = await resolveActor();
  try {
    requireAdmin(resolved.actor);
  } catch {
    return jsonError("Admin access required", 403);
  }

  const payload = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid admin payload", 400);
  }

  const action = parsed.data;
  try {
    if (action.action === "settings") {
      await updatePublicAppSettings(action.payload);
    }

    if (action.action === "provider") {
      await upsertProviderCredential(action.payload);
    }

    if (action.action === "model") {
      await updateModel(action.payload.id, action.payload);
    }

    if (action.action === "roleLimit") {
      await upsertRoleLimit(action.payload);
    }

    if (action.action === "userRoles") {
      await setUserRoles(action.payload.userId, action.payload.roles);
    }

    await logAudit({
      actorUserId: resolved.actor.userId,
      action: `admin.${action.action}`,
      targetType: "admin-config",
      payload: action.payload,
    });

    const response = NextResponse.json({ ok: true });
    return attachActorCookies(response, resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update admin configuration";
    const response = jsonError(message, 500);
    return attachActorCookies(response, resolved);
  }
}
