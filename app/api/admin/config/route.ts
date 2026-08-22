import { z } from "zod";

import { resolveActor } from "@/lib/auth/session";
import { ensureDatabase } from "@/lib/db/bootstrap";
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
import { attachActorCookies, jsonError, jsonOk, requireAdmin } from "@/lib/http";

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
      provider: z.string().min(2).max(80),
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
  await ensureDatabase();
  const resolved = await resolveActor();
  try { requireAdmin(resolved.actor); } catch { return jsonError("Admin access required", 403); }
  const [settings, providers, models, roleLimits, users] = await Promise.all([
    getPublicAppSettings(),
    listProviders(),
    listModels(),
    listRoleLimits(),
    listUsersWithRoles(),
  ]);
  return attachActorCookies(jsonOk({ settings, providers, models, roleLimits, users }), resolved);
}

export async function PATCH(req: Request) {
  await ensureDatabase();
  const resolved = await resolveActor();
  try { requireAdmin(resolved.actor); } catch { return jsonError("Admin access required", 403); }
  let raw: unknown;
  try { raw = await req.json(); } catch { return attachActorCookies(jsonError("Invalid JSON", 400), resolved); }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) return attachActorCookies(jsonError(parsed.error.issues[0]?.message || "Invalid payload", 400), resolved);
  const a = parsed.data;
  if (a.action === "settings") await updatePublicAppSettings(a.payload);
  if (a.action === "provider") await upsertProviderCredential(a.payload);
  if (a.action === "model") await updateModel(a.payload.id, a.payload);
  if (a.action === "roleLimit") await upsertRoleLimit(a.payload);
  if (a.action === "userRoles") await setUserRoles(a.payload.userId, a.payload.roles as import("@/lib/types").Role[]);
  await logAudit({ actorUserId: resolved.actor.userId, action: `admin.${a.action}`, targetType: "admin-config", payload: a.payload as Record<string, unknown> });
  return attachActorCookies(jsonOk({ ok: true }), resolved);
}

export const dynamic = "force-dynamic";
