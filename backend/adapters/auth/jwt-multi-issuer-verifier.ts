import {
  createRemoteJWKSet,
  decodeJwt,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { AuthVerificationError } from "@/backend/adapters/auth/errors";
import type { AuthIssuerConfig, TokenUse, VerifiedJwt } from "@/backend/adapters/auth/types";

interface IssuerVerifier {
  config: AuthIssuerConfig;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

export class JwtMultiIssuerVerifier {
  private readonly issuersByIssuer = new Map<string, IssuerVerifier>();

  constructor(
    issuers: AuthIssuerConfig[],
    private readonly clockSkewSeconds: number,
  ) {
    for (const issuerConfig of issuers) {
      this.issuersByIssuer.set(issuerConfig.issuer, {
        config: issuerConfig,
        jwks: createRemoteJWKSet(new URL(issuerConfig.jwksUri)),
      });
    }
  }

  async verify(token: string): Promise<VerifiedJwt> {
    if (this.issuersByIssuer.size === 0) {
      throw new AuthVerificationError(
        "auth_not_configured",
        "No auth issuers are configured for this backend",
      );
    }

    const decoded = this.decodeClaimsWithoutTrust(token);
    const issuer = decoded.iss;
    if (!issuer) {
      throw new AuthVerificationError("invalid_token", "Token is missing issuer (iss) claim");
    }

    const issuerVerifier = this.issuersByIssuer.get(issuer);
    if (!issuerVerifier) {
      throw new AuthVerificationError("unknown_issuer", `Untrusted issuer: ${issuer}`);
    }

    try {
      const { payload } = await jwtVerify(token, issuerVerifier.jwks, {
        issuer: issuerVerifier.config.issuer,
        audience: issuerVerifier.config.audience,
        clockTolerance: this.clockSkewSeconds,
        algorithms: issuerVerifier.config.algorithms,
      });

      this.assertTokenUse(issuerVerifier.config.tokenUse, payload);
      this.assertScopes(issuerVerifier.config.requiredScopes, payload);

      return {
        issuerConfig: issuerVerifier.config,
        payload,
      };
    } catch (error) {
      if (error instanceof AuthVerificationError) {
        throw error;
      }

      if (error instanceof joseErrors.JWTExpired) {
        throw new AuthVerificationError("token_expired", "Token has expired");
      }

      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        throw new AuthVerificationError("invalid_claims", error.message);
      }

      if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
        throw new AuthVerificationError("invalid_signature", "Token signature is invalid");
      }

      throw new AuthVerificationError("invalid_token", "Token verification failed");
    }
  }

  private decodeClaimsWithoutTrust(token: string): JWTPayload {
    try {
      return decodeJwt(token);
    } catch {
      throw new AuthVerificationError("invalid_token", "Authorization token is not a valid JWT");
    }
  }

  private assertTokenUse(expected: TokenUse, payload: JWTPayload): void {
    if (expected === "any") {
      return;
    }

    const tokenUse = this.readClaimAsString(payload, "token_use") ?? this.readClaimAsString(payload, "typ");
    if (!tokenUse) {
      return;
    }

    if (expected === "access") {
      const normalized = tokenUse.toLowerCase();
      const isAccess = normalized === "access" || normalized === "at+jwt";
      if (!isAccess) {
        throw new AuthVerificationError("wrong_token_type", "Expected an access token");
      }
      return;
    }

    if (expected === "id" && tokenUse.toLowerCase() !== "id") {
      throw new AuthVerificationError("wrong_token_type", "Expected an ID token");
    }
  }

  private assertScopes(requiredScopes: string[] | undefined, payload: JWTPayload): void {
    if (!requiredScopes || requiredScopes.length === 0) {
      return;
    }

    const scopeClaim = this.readClaimAsString(payload, "scope");
    const scopes = new Set((scopeClaim ?? "").split(" ").filter(Boolean));

    for (const requiredScope of requiredScopes) {
      if (!scopes.has(requiredScope)) {
        throw new AuthVerificationError(
          "insufficient_scope",
          `Token is missing required scope: ${requiredScope}`,
        );
      }
    }
  }

  private readClaimAsString(payload: JWTPayload, key: string): string | undefined {
    const claim = payload[key];
    return typeof claim === "string" ? claim : undefined;
  }
}
