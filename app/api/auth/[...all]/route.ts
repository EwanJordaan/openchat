import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/better-auth";
import { assertRateLimit, clearRateLimit, getClientAddress, registerRateLimitFailure } from "@/lib/auth/rate-limit";

const handlers = toNextJsHandler(auth);

const AUTH_RATE_LIMIT = {
  windowMs: 60_000,
  maxAttempts: 5,
  blockMs: 15 * 60_000,
};

const RATE_LIMITED_PATHS = new Set(["/api/auth/sign-in/email", "/api/auth/sign-up/email"]);

async function getRequestIdentifier(request: Request) {
  const ip = getClientAddress(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return ip;

  try {
    const payload = (await request.clone().json()) as { email?: unknown };
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    return email ? `${ip}:${email}` : ip;
  } catch {
    return ip;
  }
}

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (!RATE_LIMITED_PATHS.has(pathname)) {
    return handlers.POST(request);
  }

  const identifier = await getRequestIdentifier(request);
  const decision = assertRateLimit("auth", identifier, AUTH_RATE_LIMIT);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Too many authentication attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      },
    );
  }

  const response = await handlers.POST(request);
  if (response.ok) {
    clearRateLimit("auth", identifier);
    return response;
  }

  if (response.status >= 400 && response.status < 500) {
    registerRateLimitFailure("auth", identifier, AUTH_RATE_LIMIT);
  }

  return response;
}
