import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";

import { verifyPassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db/client";
import { mysqlAuthSchema, pgAuthSchema } from "@/lib/db/schema";
import { getUserRoles, setUserRoles } from "@/lib/db/store";
import { adminEmailSet, env } from "@/lib/env";

function dbProvider() {
  return env.DATABASE_PROVIDER === "mysql" ? "mysql" : "pg";
}

function resolvePasswordHash(account: Record<string, unknown>) {
  const maybePassword = account.password;
  if (typeof maybePassword === "string" && maybePassword.length > 0) return maybePassword;
  const maybePasswordSnake = account.password_hash;
  if (typeof maybePasswordSnake === "string" && maybePasswordSnake.length > 0) return maybePasswordSnake;
  return null;
}

export const auth = betterAuth({
  // Better Auth's Drizzle adapter requires an explicit schema in this setup.
  // Without it, runtime lookup can fail with "model was not found in schema object".
  database: drizzleAdapter(getDb().db as never, {
    provider: dbProvider(),
    camelCase: false,
    schema: dbProvider() === "mysql" ? mysqlAuthSchema : pgAuthSchema,
  }),
  appName: "OpenChat",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  plugins: [nextCookies()],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      async verify({ hash, password }) {
        return verifyPassword(password, hash);
      },
    },
  },
  user: {
    modelName: "users",
    fields: {
      image: "image_url",
      emailVerified: "is_active",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "auth_sessions",
    fields: {
      token: "token",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          const email = String(user.email || "").trim().toLowerCase();
          const roles = await getUserRoles(String(user.id));
          if (!roles.includes("user")) {
            await setUserRoles(String(user.id), [...roles, "user"]);
          }
          if (adminEmailSet.has(email)) {
            const nextRoles = await getUserRoles(String(user.id));
            if (!nextRoles.includes("admin")) {
              await setUserRoles(String(user.id), [...nextRoles, "admin"]);
            }
          }
        },
      },
    },
    account: {
      create: {
        async after(account) {
          const source = account as Record<string, unknown>;
          const providerId = String(source.providerId ?? source.provider_id ?? "");
          if (providerId !== "credential") return;
          const userId = String(source.userId ?? source.user_id ?? "");
          const passwordHash = resolvePasswordHash(source);
          if (!userId || !passwordHash) return;
          const { query } = getDb();
          await query(sql`update users set password_hash = ${passwordHash} where id = ${userId}`);
        },
      },
    },
  },
});
