import type { JWTPayload } from "jose";

import type { VerifiedJwt } from "@/backend/adapters/auth/types";
import type { Principal } from "@/backend/domain/principal";

const DEFAULT_CLAIM_MAPPING = {
  email: "email",
  name: "name",
  orgId: "org_id",
  roles: "roles",
  permissions: "permissions",
} as const;

export function mapVerifiedJwtToPrincipal(verifiedJwt: VerifiedJwt): Principal {
  const { payload, issuerConfig } = verifiedJwt;

  if (!payload.sub || !payload.iss) {
    throw new Error("Verified token is missing required sub or iss claim");
  }

  const email = readStringClaim(payload, issuerConfig.claimMapping?.email ?? DEFAULT_CLAIM_MAPPING.email);
  const name = readStringClaim(payload, issuerConfig.claimMapping?.name ?? DEFAULT_CLAIM_MAPPING.name);
  const orgId = readStringClaim(payload, issuerConfig.claimMapping?.orgId ?? DEFAULT_CLAIM_MAPPING.orgId);
  const tokenRoles =
    readStringArrayClaim(payload, issuerConfig.claimMapping?.roles ?? DEFAULT_CLAIM_MAPPING.roles) ?? [];
  const tokenPermissions =
    readStringArrayClaim(
      payload,
      issuerConfig.claimMapping?.permissions ?? DEFAULT_CLAIM_MAPPING.permissions,
    ) ?? [];

  return {
    subject: payload.sub,
    issuer: payload.iss,
    email,
    name,
    orgId,
    roles: tokenRoles,
    permissions: tokenPermissions,
    rawClaims: payload as Record<string, unknown>,
  };
}

function readStringClaim(payload: JWTPayload, claimPath: string): string | undefined {
  const value = readClaim(payload, claimPath);
  return typeof value === "string" ? value : undefined;
}

function readStringArrayClaim(payload: JWTPayload, claimPath: string): string[] | undefined {
  const value = readClaim(payload, claimPath);

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  if (typeof value === "string") {
    return value.split(" ").filter(Boolean);
  }

  return undefined;
}

function readClaim(payload: JWTPayload, claimPath: string): unknown {
  const segments = claimPath.split(".").filter(Boolean);
  let cursor: unknown = payload;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}
