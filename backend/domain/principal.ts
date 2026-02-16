export interface Principal {
  subject: string;
  issuer: string;
  email?: string;
  name?: string;
  orgId?: string;
  roles: string[];
  permissions: string[];
  rawClaims: Record<string, unknown>;
  userId?: string;
}
