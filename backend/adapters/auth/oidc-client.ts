import { z } from "zod";

import type { AuthFlowMode, AuthIssuerConfig } from "@/backend/adapters/auth/types";

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;

const RESERVED_AUTH_PARAMS = new Set([
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
]);

const oidcDiscoverySchema = z.object({
  issuer: z.string().url().optional(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  end_session_endpoint: z.string().url().optional(),
});

const oidcTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

interface OidcDiscoveryDocument {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint?: string;
}

export interface OidcTokenResult {
  accessToken: string;
  tokenType?: string;
  expiresInSeconds?: number;
  idToken?: string;
  refreshToken?: string;
  scope?: string;
}

interface BuildAuthorizationUrlInput {
  issuerConfig: AuthIssuerConfig;
  mode: AuthFlowMode;
  state: string;
  nonce: string;
  codeChallenge: string;
}

interface ExchangeAuthorizationCodeInput {
  issuerConfig: AuthIssuerConfig;
  code: string;
  codeVerifier: string;
}

const discoveryCache = new Map<string, Promise<OidcDiscoveryDocument>>();

export function listInteractiveAuthIssuers(issuers: AuthIssuerConfig[]): AuthIssuerConfig[] {
  return issuers.filter((issuer) => issuer.oidc?.clientId && issuer.oidc.redirectUri);
}

export function getInteractiveAuthIssuerByName(
  issuers: AuthIssuerConfig[],
  providerName: string,
): AuthIssuerConfig | null {
  const match = issuers.find((issuer) => issuer.name === providerName);
  if (!match || !match.oidc) {
    return null;
  }

  return match;
}

export async function buildAuthorizationUrl(input: BuildAuthorizationUrlInput): Promise<URL> {
  const oidcConfig = requireOidcConfig(input.issuerConfig);
  const discovery = await discoverIssuer(input.issuerConfig);

  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oidcConfig.clientId);
  url.searchParams.set("redirect_uri", oidcConfig.redirectUri);
  url.searchParams.set("scope", (oidcConfig.scopes ?? [...DEFAULT_SCOPES]).join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  appendCustomParams(url, oidcConfig.authorizationParams);
  appendCustomParams(url, input.mode === "register" ? oidcConfig.registerParams : oidcConfig.loginParams);

  return url;
}

export async function exchangeAuthorizationCode(
  input: ExchangeAuthorizationCodeInput,
): Promise<OidcTokenResult> {
  const oidcConfig = requireOidcConfig(input.issuerConfig);
  const discovery = await discoverIssuer(input.issuerConfig);

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("redirect_uri", oidcConfig.redirectUri);
  body.set("client_id", oidcConfig.clientId);
  body.set("code_verifier", input.codeVerifier);

  if (oidcConfig.clientSecret) {
    body.set("client_secret", oidcConfig.clientSecret);
  }

  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token exchange failed with status ${response.status}: ${errorBody}`);
  }

  const json = await response.json();
  const parsed = oidcTokenResponseSchema.parse(json);

  return {
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresInSeconds: parsed.expires_in,
    idToken: parsed.id_token,
    refreshToken: parsed.refresh_token,
    scope: parsed.scope,
  };
}

function requireOidcConfig(issuerConfig: AuthIssuerConfig) {
  if (!issuerConfig.oidc) {
    throw new Error(`Auth provider '${issuerConfig.name}' is missing oidc configuration`);
  }

  return issuerConfig.oidc;
}

function appendCustomParams(url: URL, params: Record<string, string> | undefined): void {
  if (!params) {
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    if (!value || RESERVED_AUTH_PARAMS.has(key)) {
      continue;
    }

    url.searchParams.set(key, value);
  }
}

async function discoverIssuer(issuerConfig: AuthIssuerConfig): Promise<OidcDiscoveryDocument> {
  const cacheKey = issuerConfig.issuer;

  const cached = discoveryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = fetchDiscoveryDocument(issuerConfig);
  discoveryCache.set(cacheKey, promise);

  try {
    return await promise;
  } catch (error) {
    discoveryCache.delete(cacheKey);
    throw error;
  }
}

async function fetchDiscoveryDocument(issuerConfig: AuthIssuerConfig): Promise<OidcDiscoveryDocument> {
  const discoveryUrl = buildDiscoveryUrl(issuerConfig.issuer);

  const response = await fetch(discoveryUrl.toString(), {
    signal: AbortSignal.timeout(10000),
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OIDC discovery failed for '${issuerConfig.name}' (${response.status}): ${body}`);
  }

  const json = await response.json();
  const parsed = oidcDiscoverySchema.parse(json);

  return {
    issuer: parsed.issuer,
    authorizationEndpoint: parsed.authorization_endpoint,
    tokenEndpoint: parsed.token_endpoint,
    endSessionEndpoint: parsed.end_session_endpoint,
  };
}

function buildDiscoveryUrl(issuer: string): URL {
  const issuerUrl = new URL(issuer);
  if (!issuerUrl.pathname.endsWith("/")) {
    issuerUrl.pathname = `${issuerUrl.pathname}/`;
  }

  return new URL(".well-known/openid-configuration", issuerUrl);
}
