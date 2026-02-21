export type AuthFlowMode = "login" | "register";

export interface AuthProviderOption {
  name: string;
  issuer: string;
  mode: "redirect" | "credentials";
  loginUrl: string;
  registerUrl: string;
}

interface AuthProvidersApiResponse {
  data?: AuthProviderOption[];
  error?: {
    message?: string;
  };
}

export async function fetchInteractiveAuthProviders(signal?: AbortSignal): Promise<AuthProviderOption[]> {
  const response = await fetch("/api/v1/auth/providers", {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  const payload = (await response.json()) as AuthProvidersApiResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Failed to load auth providers (${response.status})`);
  }

  return (payload.data ?? []).map((provider) => ({
    ...provider,
    mode: provider.mode === "credentials" ? "credentials" : "redirect",
  }));
}

export function isCredentialsProvider(provider: AuthProviderOption): boolean {
  return provider.mode === "credentials";
}

export function isRedirectProvider(provider: AuthProviderOption): boolean {
  return provider.mode === "redirect";
}

export function buildAuthStartUrl(input: {
  mode: AuthFlowMode;
  returnTo: string;
  providerName?: string;
}): string {
  const params = new URLSearchParams({
    mode: input.mode,
    returnTo: input.returnTo,
  });

  if (input.providerName && input.providerName !== "local") {
    params.set("provider", input.providerName);
  }

  return `/api/v1/auth/start?${params.toString()}`;
}

export function buildProviderAuthStartUrl(providerName: string, mode: AuthFlowMode, returnTo: string): string {
  return `/api/v1/auth/${encodeURIComponent(providerName)}/start?mode=${encodeURIComponent(mode)}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function parseProviderName(raw: string | null): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return undefined;
  }

  return value;
}

export function formatProviderNameLabel(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
