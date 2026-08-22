/* eslint-disable @typescript-eslint/no-explicit-any */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";

let authInstance: unknown = null;

function createAuth(): unknown {
  const db = getDb().db as unknown as Parameters<typeof drizzleAdapter>[0];
  const provider = (env.DATABASE_PROVIDER === "mysql" ? "mysql" : "pg") as "pg" | "mysql";
  return betterAuth({
    database: drizzleAdapter(db, { provider }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  });
}

export const auth = new Proxy({} as any, {
  get(_target, prop) {
    if (!authInstance) {
      try {
        authInstance = createAuth();
      } catch {
        // fallback stub for typecheck/test without DB
        authInstance = { api: { getSession: async () => null, signOut: async () => undefined } };
      }
    }
    return (authInstance as any)[prop];
  },
}) as any;
