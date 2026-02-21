import { createHash } from "node:crypto";

import type { ApplicationContainer } from "@/backend/composition/container";
import type { Principal } from "@/backend/domain/principal";
import { ApiError } from "@/backend/transport/rest/api-error";
import {
  OPENCHAT_PROVIDER_DEFAULT_MODELS,
  resolveModelId,
  type ModelProviderId,
} from "@/shared/model-providers";

export type OpenChatAccessRole = "guest" | "member" | "admin";

export interface ResolveAiRequestPolicyInput {
  container: ApplicationContainer;
  principal: Principal | null;
  requestedModelProvider?: ModelProviderId;
  requestedModel?: string;
}

export interface ResolvedAiRequestPolicy {
  modelProvider: ModelProviderId;
  model: string;
  role: OpenChatAccessRole;
}

export function resolveAiRequestPolicy(input: ResolveAiRequestPolicyInput): ResolvedAiRequestPolicy {
  const role = resolveAccessRole(input.principal);
  const defaultModelProvider = input.container.config.ai.defaultModelProvider;
  const requestedProvider = input.requestedModelProvider ?? defaultModelProvider;

  const modelProvider = input.container.config.ai.allowUserModelProviderSelection
    ? requestedProvider
    : defaultModelProvider;

  const fallbackModel =
    modelProvider === "openrouter"
      ? input.container.config.ai.openrouter.allowedModels[0] ??
        OPENCHAT_PROVIDER_DEFAULT_MODELS[modelProvider]
      : OPENCHAT_PROVIDER_DEFAULT_MODELS[modelProvider];

  const model = resolveModelId(input.requestedModel, fallbackModel);

  if (modelProvider === "openrouter") {
    const allowedModels = input.container.config.ai.openrouter.allowedModels;
    if (!allowedModels.includes(model)) {
      throw new ApiError(
        403,
        "model_not_allowed",
        "Selected OpenRouter model is not allowed by admin policy",
        {
          modelProvider,
          model,
          allowedModels,
        },
      );
    }
  }

  return {
    modelProvider,
    model,
    role,
  };
}

export async function enforceOpenRouterDailyRateLimit(input: {
  request: Request;
  container: ApplicationContainer;
  principal: Principal | null;
  role: OpenChatAccessRole;
  modelProvider: ModelProviderId;
}): Promise<void> {
  if (input.modelProvider !== "openrouter") {
    return;
  }

  const roleLimit = getRoleDailyLimit(input.container, input.role);
  if (roleLimit <= 0) {
    throw new ApiError(429, "rate_limit_exceeded", "OpenRouter access is disabled for this role", {
      role: input.role,
      limit: roleLimit,
      period: "day",
    });
  }

  const usageDate = new Date().toISOString().slice(0, 10);
  const subject = resolveSubject(input.request, input.principal);

  const result = await input.container.unitOfWork.run(async ({ aiUsage }) => {
    return aiUsage.consumeDailyRequestAllowance({
      providerId: "openrouter",
      usageDate,
      subjectType: subject.type,
      subjectId: subject.id,
      limit: roleLimit,
    });
  });

  if (!result.allowed) {
    throw new ApiError(429, "rate_limit_exceeded", "OpenRouter daily request limit reached", {
      role: input.role,
      usageDate,
      limit: roleLimit,
      requestCount: result.requestCount,
      period: "day",
      resetsAt: `${usageDate}T23:59:59.999Z`,
    });
  }
}

function resolveAccessRole(principal: Principal | null): OpenChatAccessRole {
  if (!principal?.userId) {
    return "guest";
  }

  const roles = new Set(principal.roles);
  if (roles.has("admin")) {
    return "admin";
  }

  return "member";
}

function getRoleDailyLimit(container: ApplicationContainer, role: OpenChatAccessRole): number {
  const limits = container.config.ai.openrouter.rateLimits;
  if (role === "guest") {
    return limits.guestRequestsPerDay;
  }

  if (role === "admin") {
    return limits.adminRequestsPerDay;
  }

  return limits.memberRequestsPerDay;
}

function resolveSubject(
  request: Request,
  principal: Principal | null,
): { type: "user" | "guest"; id: string } {
  if (principal?.userId) {
    return {
      type: "user",
      id: principal.userId,
    };
  }

  const ip = resolveClientIp(request);
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  const rawGuestKey = `${ip}|${userAgent}`;
  const guestHash = createHash("sha256").update(rawGuestKey).digest("hex");

  return {
    type: "guest",
    id: guestHash,
  };
}

function resolveClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xForwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "unknown";
}
