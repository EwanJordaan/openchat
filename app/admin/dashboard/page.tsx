"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface RuntimeEnvSettings {
  database: {
    adapter: "postgres" | "convex";
    databaseUrl: string;
  };
  auth: {
    defaultProviderName: string;
    clockSkewSeconds: number;
    localEnabled: boolean;
    localCookieName: string;
    localSessionMaxAgeSeconds: number;
    sessionSecureCookiesMode: "auto" | "true" | "false";
    sessionCookieName: string;
    flowCookieName: string;
    issuersJson: string;
  };
}

interface ProviderApiKeysStatus {
  openrouterConfigured: boolean;
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
}

interface DashboardStatusItem {
  level: "ready" | "warning" | "error";
  message: string;
}

interface DashboardSummary {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

interface AdminDashboardData {
  envFilePath: string;
  runtimeSettings: RuntimeEnvSettings;
  apiKeys: ProviderApiKeysStatus;
  authMode: "none" | "local" | "oidc" | "invalid";
  checks: {
    database: DashboardStatusItem;
    auth: DashboardStatusItem;
    sessionSecret: DashboardStatusItem;
  };
  summary: DashboardSummary;
}

interface AdminDashboardApiResponse {
  data?: AdminDashboardData;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AdminRuntimeSettingsApiResponse {
  data?: {
    filePath: string;
    settings: RuntimeEnvSettings;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface AdminSessionApiResponse {
  data?: {
    authenticated: boolean;
    mustChangePassword: boolean;
  };
}

interface OidcIssuerDraft {
  name: string;
  issuer: string;
  audience: string;
  jwksUri: string;
  tokenUse: "access" | "id" | "any";
  clientId: string;
  redirectUri: string;
}

type PresetId = "auth0" | "clerk" | "custom";
type QuickAuthMode = "none" | "local" | "oidc";
type AdminAuthState = "loading" | "unauthenticated" | "password_change_required" | "authenticated";

const AUTH0_PRESET: OidcIssuerDraft = {
  name: "auth0",
  issuer: "https://YOUR_TENANT.us.auth0.com/",
  audience: "https://api.openchat.local",
  jwksUri: "https://YOUR_TENANT.us.auth0.com/.well-known/jwks.json",
  tokenUse: "access",
  clientId: "",
  redirectUri: "",
};

const CLERK_PRESET: OidcIssuerDraft = {
  name: "clerk",
  issuer: "https://YOUR_CLERK_FRONTEND_API",
  audience: "https://api.openchat.local",
  jwksUri: "https://api.clerk.com/v1/jwks",
  tokenUse: "access",
  clientId: "",
  redirectUri: "",
};

const CUSTOM_PRESET: OidcIssuerDraft = {
  name: "",
  issuer: "",
  audience: "",
  jwksUri: "",
  tokenUse: "access",
  clientId: "",
  redirectUri: "",
};

export default function AdminDashboardPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AdminAuthState>("loading");
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeEnvSettings | null>(null);
  const [quickAuthMode, setQuickAuthMode] = useState<QuickAuthMode>("none");
  const [presetId, setPresetId] = useState<PresetId>("auth0");
  const [issuerDraft, setIssuerDraft] = useState<OidcIssuerDraft>(AUTH0_PRESET);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isDisposed = false;

    async function load() {
      try {
        const sessionResponse = await fetch("/api/v1/admin/auth/session", {
          credentials: "include",
          cache: "no-store",
        });

        const sessionPayload = (await sessionResponse.json()) as AdminSessionApiResponse;
        const session = sessionPayload.data;

        if (!session?.authenticated) {
          if (!isDisposed) {
            setAuthState("unauthenticated");
          }
          return;
        }

        if (session.mustChangePassword) {
          if (!isDisposed) {
            setAuthState("password_change_required");
          }
          return;
        }

        if (!isDisposed) {
          setAuthState("authenticated");
        }

        await refreshDashboard(isDisposed);
      } catch (error) {
        if (!isDisposed) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load dashboard.");
          setAuthState("unauthenticated");
        }
      }
    }

    void load();

    return () => {
      isDisposed = true;
    };
  }, []);

  const dbUrlRequired = useMemo(
    () => runtimeDraft?.database.adapter === "postgres",
    [runtimeDraft?.database.adapter],
  );

  async function refreshDashboard(isDisposed = false) {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/v1/admin/dashboard", {
        credentials: "include",
        cache: "no-store",
      });

      const payload = (await response.json()) as AdminDashboardApiResponse;
      if (!response.ok || !payload.data) {
        if (response.status === 401 && !isDisposed) {
          setAuthState("unauthenticated");
          return;
        }

        if (payload.error?.code === "admin_password_change_required" && !isDisposed) {
          setAuthState("password_change_required");
          return;
        }

        throw new Error(payload.error?.message ?? `Unable to load dashboard (${response.status})`);
      }

      if (isDisposed) {
        return;
      }

      setDashboardData(payload.data);
      setRuntimeDraft(payload.data.runtimeSettings);

      const nextQuickAuthMode = deriveQuickAuthMode(payload.data.runtimeSettings);
      setQuickAuthMode(nextQuickAuthMode);
      setIssuerDraft(parseIssuerDraft(payload.data.runtimeSettings.auth.issuersJson));
      setPresetId(detectPreset(parseIssuerDraft(payload.data.runtimeSettings.auth.issuersJson)));
      setErrorMessage(null);
    } catch (error) {
      if (!isDisposed) {
        setErrorMessage(error instanceof Error ? error.message : "Could not refresh dashboard.");
      }
    } finally {
      if (!isDisposed) {
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveQuickSetup() {
    if (!runtimeDraft || isSaving) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const nextDraft = buildRuntimeDraftForSave(runtimeDraft, quickAuthMode, issuerDraft);

      if (nextDraft.database.adapter === "postgres" && nextDraft.database.databaseUrl.trim().length === 0) {
        throw new Error("DATABASE_URL is required when adapter is postgres.");
      }

      const response = await fetch("/api/v1/admin/runtime-settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(nextDraft),
      });

      const payload = (await response.json()) as AdminRuntimeSettingsApiResponse;
      if (!response.ok || !payload.data) {
        if (response.status === 401) {
          setAuthState("unauthenticated");
          return;
        }

        if (payload.error?.code === "admin_password_change_required") {
          setAuthState("password_change_required");
          return;
        }

        throw new Error(payload.error?.message ?? `Unable to save runtime settings (${response.status})`);
      }

      setRuntimeDraft(payload.data.settings);
      setStatusMessage("Quick setup saved. Re-running checks...");
      await refreshDashboard();
      setStatusMessage("Quick setup saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save quick setup.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePresetChange(nextPreset: PresetId) {
    setPresetId(nextPreset);

    if (nextPreset === "auth0") {
      setIssuerDraft((previous) => ({
        ...AUTH0_PRESET,
        clientId: previous.clientId,
        redirectUri: previous.redirectUri,
      }));
      return;
    }

    if (nextPreset === "clerk") {
      setIssuerDraft((previous) => ({
        ...CLERK_PRESET,
        clientId: previous.clientId,
        redirectUri: previous.redirectUri,
      }));
      return;
    }

    setIssuerDraft((previous) => ({
      ...CUSTOM_PRESET,
      tokenUse: previous.tokenUse,
      clientId: previous.clientId,
      redirectUri: previous.redirectUri,
    }));
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await fetch("/api/v1/admin/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/admin/login?returnTo=%2Fadmin%2Fdashboard");
    }
  }

  if (authState === "loading") {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-2xl p-8">
          <p className="text-sm text-[color:var(--text-muted)]">Loading admin dashboard...</p>
        </section>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-lg p-8">
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">Admin login required</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            Sign in with the local admin password to open the setup dashboard.
          </p>
          <Link
            href="/admin/login?returnTo=%2Fadmin%2Fdashboard"
            className="mt-4 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
          >
            Go to admin login
          </Link>
        </section>
      </main>
    );
  }

  if (authState === "password_change_required") {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-lg p-8">
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">Password change required</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            Rotate the default admin password before continuing setup.
          </p>
          <Link
            href="/admin/password?returnTo=%2Fadmin%2Fdashboard"
            className="mt-4 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
          >
            Change admin password
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen p-4 sm:p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 mx-auto w-full max-w-5xl p-5 sm:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">Setup Dashboard</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Guided setup for database and auth, with live readiness checks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/settings"
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            >
              Advanced settings
            </Link>
            <Link
              href="/admin/password?returnTo=%2Fadmin%2Fdashboard"
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            >
              Change password
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)] disabled:opacity-60"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          {dashboardData ? (
            <>
              <StatusCard title="Database" status={dashboardData.checks.database} />
              <StatusCard title="Auth" status={dashboardData.checks.auth} />
              <StatusCard title="Session" status={dashboardData.checks.sessionSecret} />
            </>
          ) : (
            <p className="text-sm text-[color:var(--text-muted)]">Loading readiness checks...</p>
          )}
        </section>

        {dashboardData ? (
          <section className="surface-soft mt-4 rounded-xl border border-white/10 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[color:var(--text-primary)]">
                Setup status: {dashboardData.summary.ready ? "Ready" : "Action needed"}
              </p>
              <button
                type="button"
                onClick={() => void refreshDashboard()}
                disabled={isRefreshing}
                className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-xs font-semibold text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/14 disabled:opacity-60"
              >
                {isRefreshing ? "Refreshing..." : "Re-run checks"}
              </button>
            </div>

            {dashboardData.summary.blockers.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm text-[color:var(--accent-secondary-strong)]">
                {dashboardData.summary.blockers.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
              </div>
            ) : null}

            {dashboardData.summary.warnings.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm text-[color:var(--text-muted)]">
                {dashboardData.summary.warnings.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {runtimeDraft ? (
          <section className="surface-soft mt-4 rounded-xl border border-white/10 px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Quick Setup</p>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Save database and auth runtime settings to {dashboardData?.envFilePath ?? ".env"}.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-db-adapter">
                <span className="block">Database adapter</span>
                <select
                  id="dashboard-db-adapter"
                  value={runtimeDraft.database.adapter}
                  onChange={(event) =>
                    setRuntimeDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            database: {
                              ...previous.database,
                              adapter: event.target.value as RuntimeEnvSettings["database"]["adapter"],
                            },
                          }
                        : previous,
                    )
                  }
                  className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  <option value="postgres">postgres</option>
                  <option value="convex">convex</option>
                </select>
              </label>

              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-db-url">
                <span className="block">Database URL (postgres)</span>
                <input
                  id="dashboard-db-url"
                  type="password"
                  value={runtimeDraft.database.databaseUrl}
                  onChange={(event) =>
                    setRuntimeDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            database: {
                              ...previous.database,
                              databaseUrl: event.target.value,
                            },
                          }
                        : previous,
                    )
                  }
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  placeholder="postgres://..."
                  autoComplete="off"
                />
                {dbUrlRequired ? null : (
                  <span className="block text-xs text-[color:var(--text-dim)]">
                    Optional in convex mode.
                  </span>
                )}
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-auth-mode">
                <span className="block">Auth mode</span>
                <select
                  id="dashboard-auth-mode"
                  value={quickAuthMode}
                  onChange={(event) => setQuickAuthMode(event.target.value as QuickAuthMode)}
                  className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  <option value="local">Local (email/password)</option>
                  <option value="oidc">OIDC (Auth0/Clerk/custom)</option>
                  <option value="none">None (not configured)</option>
                </select>
              </label>

              {quickAuthMode === "oidc" ? (
                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-auth-preset">
                  <span className="block">Provider preset</span>
                  <select
                    id="dashboard-auth-preset"
                    value={presetId}
                    onChange={(event) => handlePresetChange(event.target.value as PresetId)}
                    className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  >
                    <option value="auth0">Auth0</option>
                    <option value="clerk">Clerk</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              ) : (
                <div className="surface-soft rounded-lg border border-white/10 px-3 py-2 text-sm text-[color:var(--text-dim)]">
                  {quickAuthMode === "local"
                    ? "Local auth selected. OIDC issuers will be cleared."
                    : "Auth is not configured. Protected routes will require setup later."}
                </div>
              )}
            </div>

            {quickAuthMode === "oidc" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-issuer-name">
                  <span className="block">Provider name</span>
                  <input
                    id="dashboard-issuer-name"
                    type="text"
                    value={issuerDraft.name}
                    onChange={(event) => setIssuerDraft((previous) => ({ ...previous, name: event.target.value }))}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="auth0"
                  />
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-issuer-url">
                  <span className="block">Issuer URL</span>
                  <input
                    id="dashboard-issuer-url"
                    type="url"
                    value={issuerDraft.issuer}
                    onChange={(event) => setIssuerDraft((previous) => ({ ...previous, issuer: event.target.value }))}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="https://tenant.example.com/"
                  />
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-issuer-audience">
                  <span className="block">Audience</span>
                  <input
                    id="dashboard-issuer-audience"
                    type="text"
                    value={issuerDraft.audience}
                    onChange={(event) => setIssuerDraft((previous) => ({ ...previous, audience: event.target.value }))}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="https://api.openchat.local"
                  />
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-issuer-jwks">
                  <span className="block">JWKS URL</span>
                  <input
                    id="dashboard-issuer-jwks"
                    type="url"
                    value={issuerDraft.jwksUri}
                    onChange={(event) => setIssuerDraft((previous) => ({ ...previous, jwksUri: event.target.value }))}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="https://tenant/.well-known/jwks.json"
                  />
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-token-use">
                  <span className="block">Token use</span>
                  <select
                    id="dashboard-token-use"
                    value={issuerDraft.tokenUse}
                    onChange={(event) =>
                      setIssuerDraft((previous) => ({
                        ...previous,
                        tokenUse: event.target.value as OidcIssuerDraft["tokenUse"],
                      }))
                    }
                    className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  >
                    <option value="access">access</option>
                    <option value="id">id</option>
                    <option value="any">any</option>
                  </select>
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="dashboard-oidc-client-id">
                  <span className="block">OIDC Client ID (optional)</span>
                  <input
                    id="dashboard-oidc-client-id"
                    type="text"
                    value={issuerDraft.clientId}
                    onChange={(event) =>
                      setIssuerDraft((previous) => ({ ...previous, clientId: event.target.value }))
                    }
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="your-client-id"
                  />
                </label>

                <label className="space-y-1 text-sm text-[color:var(--text-primary)] sm:col-span-2" htmlFor="dashboard-oidc-redirect-uri">
                  <span className="block">OIDC Redirect URI (optional)</span>
                  <input
                    id="dashboard-oidc-redirect-uri"
                    type="url"
                    value={issuerDraft.redirectUri}
                    onChange={(event) =>
                      setIssuerDraft((previous) => ({ ...previous, redirectUri: event.target.value }))
                    }
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    placeholder="http://localhost:3000/api/v1/auth/auth0/callback"
                  />
                </label>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveQuickSetup()}
                disabled={isSaving}
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isSaving ? "Saving setup..." : "Save quick setup"}
              </button>
              <Link
                href="/admin/settings"
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
              >
                Open advanced settings
              </Link>
            </div>

            {statusMessage ? <p className="mt-3 text-sm text-[color:var(--accent-primary-strong)]">{statusMessage}</p> : null}
            {errorMessage ? <p className="mt-3 text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
          </section>
        ) : null}

        <section className="surface-soft mt-4 rounded-xl border border-white/10 px-4 py-4 sm:px-5">
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Provider API Keys</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ProviderStatusLine
              label="OpenRouter"
              configured={Boolean(dashboardData?.apiKeys.openrouterConfigured)}
            />
            <ProviderStatusLine label="OpenAI" configured={Boolean(dashboardData?.apiKeys.openaiConfigured)} />
            <ProviderStatusLine
              label="Anthropic"
              configured={Boolean(dashboardData?.apiKeys.anthropicConfigured)}
            />
            <ProviderStatusLine label="Google Gemini" configured={Boolean(dashboardData?.apiKeys.geminiConfigured)} />
          </div>
          <p className="mt-3 text-xs text-[color:var(--text-dim)]">
            Add or rotate keys in <Link href="/admin/settings" className="underline">advanced settings</Link>.
          </p>
        </section>
      </section>
    </main>
  );
}

function StatusCard({ title, status }: { title: string; status: DashboardStatusItem }) {
  const toneClass =
    status.level === "ready"
      ? "border-emerald-400/35 text-emerald-200"
      : status.level === "warning"
        ? "border-amber-300/35 text-amber-100"
        : "border-rose-300/35 text-rose-200";

  return (
    <article className={`surface-soft rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.12em]">{title}</p>
      <p className="mt-2 text-sm leading-relaxed">{status.message}</p>
    </article>
  );
}

function ProviderStatusLine({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="surface-soft flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
      <span className="text-[color:var(--text-primary)]">{label}</span>
      <span className={configured ? "text-emerald-200" : "text-[color:var(--text-dim)]"}>
        {configured ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}

function deriveQuickAuthMode(settings: RuntimeEnvSettings): QuickAuthMode {
  if (settings.auth.localEnabled) {
    return "local";
  }

  if (settings.auth.issuersJson.trim().length > 0) {
    return "oidc";
  }

  return "none";
}

function parseIssuerDraft(rawIssuersJson: string): OidcIssuerDraft {
  const trimmed = rawIssuersJson.trim();
  if (!trimmed) {
    return AUTH0_PRESET;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return AUTH0_PRESET;
    }

    const firstIssuer = parsed[0];
    if (!firstIssuer || typeof firstIssuer !== "object") {
      return AUTH0_PRESET;
    }

    const issuer = firstIssuer as {
      name?: unknown;
      issuer?: unknown;
      audience?: unknown;
      jwksUri?: unknown;
      tokenUse?: unknown;
      oidc?: {
        clientId?: unknown;
        redirectUri?: unknown;
      };
    };

    const audience = Array.isArray(issuer.audience)
      ? issuer.audience.filter((entry): entry is string => typeof entry === "string").join(",")
      : typeof issuer.audience === "string"
        ? issuer.audience
        : "";

    return {
      name: typeof issuer.name === "string" ? issuer.name : "",
      issuer: typeof issuer.issuer === "string" ? issuer.issuer : "",
      audience,
      jwksUri: typeof issuer.jwksUri === "string" ? issuer.jwksUri : "",
      tokenUse:
        issuer.tokenUse === "id" || issuer.tokenUse === "any" || issuer.tokenUse === "access"
          ? issuer.tokenUse
          : "access",
      clientId: typeof issuer.oidc?.clientId === "string" ? issuer.oidc.clientId : "",
      redirectUri: typeof issuer.oidc?.redirectUri === "string" ? issuer.oidc.redirectUri : "",
    };
  } catch {
    return AUTH0_PRESET;
  }
}

function detectPreset(draft: OidcIssuerDraft): PresetId {
  if (draft.name === "auth0" && draft.jwksUri.includes(".well-known/jwks.json")) {
    return "auth0";
  }

  if (draft.name === "clerk" && draft.jwksUri === "https://api.clerk.com/v1/jwks") {
    return "clerk";
  }

  return "custom";
}

function buildRuntimeDraftForSave(
  runtimeDraft: RuntimeEnvSettings,
  quickAuthMode: QuickAuthMode,
  issuerDraft: OidcIssuerDraft,
): RuntimeEnvSettings {
  if (quickAuthMode === "local") {
    return {
      ...runtimeDraft,
      auth: {
        ...runtimeDraft.auth,
        localEnabled: true,
        defaultProviderName: "",
        issuersJson: "",
      },
    };
  }

  if (quickAuthMode === "none") {
    return {
      ...runtimeDraft,
      auth: {
        ...runtimeDraft.auth,
        localEnabled: false,
        defaultProviderName: "",
        issuersJson: "",
      },
    };
  }

  const normalizedName = issuerDraft.name.trim();
  const normalizedIssuer = issuerDraft.issuer.trim();
  const normalizedAudience = issuerDraft.audience.trim();
  const normalizedJwksUri = issuerDraft.jwksUri.trim();

  if (!normalizedName || !normalizedIssuer || !normalizedAudience || !normalizedJwksUri) {
    throw new Error("OIDC setup requires provider name, issuer URL, audience, and JWKS URL.");
  }

  const audience = normalizedAudience.includes(",")
    ? normalizedAudience
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : normalizedAudience;

  const issuerPayload: Record<string, unknown> = {
    name: normalizedName,
    issuer: normalizedIssuer,
    audience,
    jwksUri: normalizedJwksUri,
    tokenUse: issuerDraft.tokenUse,
  };

  const clientId = issuerDraft.clientId.trim();
  const redirectUri = issuerDraft.redirectUri.trim();
  if (clientId && redirectUri) {
    issuerPayload.oidc = {
      clientId,
      redirectUri,
      scopes: ["openid", "profile", "email"],
    };
  }

  return {
    ...runtimeDraft,
    auth: {
      ...runtimeDraft.auth,
      localEnabled: false,
      defaultProviderName: normalizedName,
      issuersJson: JSON.stringify([issuerPayload], null, 2),
    },
  };
}
