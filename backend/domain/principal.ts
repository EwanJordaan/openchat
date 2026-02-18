export interface Principal {
  subject: string;
  issuer: string;
  providerName?: string;
  email?: string;
  name?: string;
  orgId?: string;
  roles: string[];
  permissions: string[];
  authMethod?: "oidc";
  rawClaims: Record<string, unknown>;
  userId?: string;
}
