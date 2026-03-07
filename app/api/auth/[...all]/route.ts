import { toNextJsHandler } from "better-auth/next-js";

import {
  assertRateLimit,
  clearRateLimit,
  getClientAddress,
  registerRateLimitFailure,
} from "@/lib/auth/rate-limit";
import { auth } from "@/lib/auth/better-auth";
import { findUserByEmail } from "@/lib/db/store";
import { env } from "@/lib/env";
import { toBool } from "@/lib/utils";

const handlers = toNextJsHandler(auth);

const LOGIN_PATH = "/api/auth/sign-in/email";
const REGISTER_PATH = "/api/auth/sign-up/email";

const loginRateLimitConfig = {
  windowMs: env.AUTH_LOGIN_WINDOW_MS,
  maxAttempts: env.AUTH_LOGIN_MAX_ATTEMPTS,
  blockMs: env.AUTH_LOGIN_BLOCK_MS,
};

const registerRateLimitConfig = {
  windowMs: env.AUTH_REGISTER_WINDOW_MS,
  maxAttempts: env.AUTH_REGISTER_MAX_ATTEMPTS,
  blockMs: env.AUTH_REGISTER_BLOCK_MS,
};

async function readEmail(request: Request) {
  try {
    const payload = (await request.clone().json()) as { email?: unknown };
    if (typeof payload.email !== "string") return null;
    const normalized = payload.email.trim().toLowerCase();
    return normalized || null;
  } catch {
    return null;
  }
}

function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      error: "Too many authentication attempts. Please try again later.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function buildIdentifier(ip: string, email: string | null) {
  return email ? `${ip}:${email}` : ip;
}

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== LOGIN_PATH && pathname !== REGISTER_PATH) {
    return handlers.POST(request);
  }

  const ip = getClientAddress(request);
  const email = await readEmail(request);
  const isLogin = pathname === LOGIN_PATH;
  const scope = isLogin ? "auth-login" : "auth-register";
  const config = isLogin ? loginRateLimitConfig : registerRateLimitConfig;
  const identifier = buildIdentifier(ip, email);

  const decision = assertRateLimit(scope, identifier, config);
  if (!decision.allowed) {
    return rateLimitResponse(decision.retryAfterSeconds);
  }

  if (isLogin && email) {
    const user = await findUserByEmail(email);
    if (user && !toBool(user.is_active)) {
      registerRateLimitFailure(scope, identifier, config);
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }
  }

  const response = await handlers.POST(request);
  if (response.ok) {
    clearRateLimit(scope, identifier);
  } else {
    registerRateLimitFailure(scope, identifier, config);
  }
  return response;
}
