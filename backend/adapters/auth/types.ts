import type { JWTPayload } from "jose";

export type TokenUse = "access" | "id" | "any";

export type AuthFlowMode = "login" | "register";

export interface IssuerClaimMapping {
  email?: string;
  name?: string;
  orgId?: string;
  roles?: string;
  permissions?: string;
}

export interface OidcClientConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  authorizationParams?: Record<string, string>;
  loginParams?: Record<string, string>;
  registerParams?: Record<string, string>;
  postLogoutRedirectUri?: string;
}

export interface AuthIssuerConfig {
  name: string;
  issuer: string;
  audience: string | string[];
  jwksUri: string;
  tokenUse: TokenUse;
  algorithms?: string[];
  requiredScopes?: string[];
  claimMapping?: IssuerClaimMapping;
  oidc?: OidcClientConfig;
}

export interface VerifiedJwt {
  issuerConfig: AuthIssuerConfig;
  payload: JWTPayload;
}
