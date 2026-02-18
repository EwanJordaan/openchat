import type { Principal } from "@/backend/domain/principal";
import type { AuthContextProvider } from "@/backend/ports/auth-context-provider";
import type { UnitOfWork } from "@/backend/ports/unit-of-work";

import { AuthVerificationError } from "@/backend/adapters/auth/errors";
import { JwtMultiIssuerVerifier } from "@/backend/adapters/auth/jwt-multi-issuer-verifier";
import { mapVerifiedJwtToPrincipal } from "@/backend/adapters/auth/principal-mapper";

export class JitProvisioningAuthContextProvider implements AuthContextProvider {
  constructor(
    private readonly jwtVerifier: JwtMultiIssuerVerifier,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async getPrincipal(authorizationHeader: string | null): Promise<Principal | null> {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      return null;
    }

    const verifiedJwt = await this.jwtVerifier.verify(token);
    const principal = mapVerifiedJwtToPrincipal(verifiedJwt);

    if (!principal.subject || !principal.issuer) {
      throw new AuthVerificationError("invalid_claims", "Token did not produce a valid principal");
    }

    return this.unitOfWork.run(async ({ users, roles }) => {
      let user = await users.getByExternalIdentity(principal.issuer, principal.subject);

      if (!user) {
        user = await users.createUser({
          email: principal.email ?? null,
          name: principal.name ?? null,
        });

        await users.linkExternalIdentity(user.id, principal.issuer, principal.subject);
        await roles.assignRoleToUser(user.id, "member");
      } else {
        const profilePatch: { email?: string | null; name?: string | null } = {};

        if (principal.email !== undefined && principal.email !== user.email) {
          profilePatch.email = principal.email;
        }

        if ((user.name === null || user.name.trim().length === 0) && principal.name !== undefined) {
          profilePatch.name = principal.name;
        }

        const profileHasChanges = profilePatch.email !== undefined || profilePatch.name !== undefined;

        if (profileHasChanges) {
          user = await users.updateProfile(user.id, profilePatch);
        }
      }

      const now = new Date().toISOString();
      await users.touchLastSeen(user.id, now);
      await users.upsertExternalIdentityMetadata(user.id, principal.issuer, principal.subject, {
        providerName: principal.providerName ?? principal.issuer,
        email: principal.email ?? null,
        name: principal.name ?? null,
        rawClaims: principal.rawClaims,
        lastAuthenticatedAtIso: now,
      });

      const roleNames = await roles.listRoleNamesForUser(user.id);

      return {
        ...principal,
        userId: user.id,
        authMethod: "oidc" as const,
        roles: roleNames.length > 0 ? roleNames : principal.roles,
      };
    });
  }
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}
