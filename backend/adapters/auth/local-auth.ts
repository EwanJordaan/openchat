import type { Principal } from "@/backend/domain/principal";
import type { ApplicationContainer } from "@/backend/composition/container";

import { hashLocalPassword, verifyLocalPassword } from "@/backend/adapters/auth/local-password";
import { readLocalAuthSessionFromCookie } from "@/backend/adapters/auth/local-session";

export type LocalAuthFailureCode = "invalid_credentials" | "email_taken";

export class LocalAuthFailure extends Error {
  constructor(
    public readonly code: LocalAuthFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalAuthFailure";
  }
}

export interface RegisterLocalAuthInput {
  email: string;
  password: string;
  name?: string | null;
}

export interface LoginLocalAuthInput {
  email: string;
  password: string;
}

export interface LocalAuthIdentityResult {
  sessionId: string;
  userId: string;
  expiresAt: string;
}

export async function registerWithLocalAuth(
  container: ApplicationContainer,
  input: RegisterLocalAuthInput,
): Promise<LocalAuthIdentityResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedName = normalizeName(input.name);
  const passwordHash = hashLocalPassword(input.password);
  const expiresAt = buildSessionExpiryIso(container);

  return container.unitOfWork.run(async ({ localAuth, roles, users }) => {
    const existing = await localAuth.getCredentialByEmail(normalizedEmail);
    if (existing) {
      throw new LocalAuthFailure("email_taken", "An account with this email already exists");
    }

    const user = await users.createUser({
      email: normalizedEmail,
      name: normalizedName,
    });

    await roles.assignRoleToUser(user.id, "member");
    await localAuth.createCredential({
      userId: user.id,
      email: normalizedEmail,
      passwordHash,
    });

    const sessionId = crypto.randomUUID();
    await localAuth.createSession({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });

    return {
      sessionId,
      userId: user.id,
      expiresAt,
    };
  });
}

export async function loginWithLocalAuth(
  container: ApplicationContainer,
  input: LoginLocalAuthInput,
): Promise<LocalAuthIdentityResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const expiresAt = buildSessionExpiryIso(container);

  return container.unitOfWork.run(async ({ localAuth, users }) => {
    const credential = await localAuth.getCredentialByEmail(normalizedEmail);
    if (!credential || !verifyLocalPassword(input.password, credential.passwordHash)) {
      throw new LocalAuthFailure("invalid_credentials", "Email or password is incorrect");
    }

    const user = await users.getById(credential.userId);
    if (!user) {
      throw new LocalAuthFailure("invalid_credentials", "Email or password is incorrect");
    }

    const sessionId = crypto.randomUUID();
    await localAuth.createSession({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });
    await users.touchLastSeen(user.id, new Date().toISOString());

    return {
      sessionId,
      userId: user.id,
      expiresAt,
    };
  });
}

export async function resolvePrincipalFromLocalSession(
  request: Request,
  container: ApplicationContainer,
): Promise<Principal | null> {
  if (!container.config.auth.local.enabled) {
    return null;
  }

  const cookieSession = readLocalAuthSessionFromCookie(request.headers.get("cookie"), container.config);
  if (!cookieSession) {
    return null;
  }

  return container.unitOfWork.run(async ({ localAuth, roles, users }) => {
    const session = await localAuth.getSessionById(cookieSession.sessionId);
    if (!session) {
      return null;
    }

    const user = await users.getById(session.userId);
    if (!user) {
      await localAuth.revokeSession(session.id);
      return null;
    }

    const roleNames = await roles.listRoleNamesForUser(user.id);
    const now = new Date().toISOString();
    await users.touchLastSeen(user.id, now);

    return {
      subject: user.id,
      issuer: "local",
      providerName: "local",
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      roles: roleNames,
      permissions: [],
      authMethod: "local",
      rawClaims: {},
      userId: user.id,
    } satisfies Principal;
  });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function buildSessionExpiryIso(container: ApplicationContainer): string {
  const maxAgeMs = container.config.auth.local.sessionMaxAgeSeconds * 1000;
  return new Date(Date.now() + maxAgeMs).toISOString();
}
