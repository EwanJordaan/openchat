import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/better-auth";

// Proxy to better-auth handler. Keep request handling inside better-auth.
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.GET;
