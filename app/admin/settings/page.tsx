"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { openChatConfig, type OpenChatConfig } from "@/openchat.config";
import { OPENCHAT_MODEL_PROVIDER_OPTIONS } from "@/shared/model-providers";
import { OPENCHAT_THEME_OPTIONS } from "@/shared/themes";

interface AdminSettingsApiResponse {
  data?: {
    filePath: string;
    usingDefaults: boolean;
    config: OpenChatConfig;
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

interface ProviderApiKeysStatus {
  openrouterConfigured: boolean;
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  geminiConfigured: boolean;
}

interface AdminApiKeysApiResponse {
  data?: {
    envFilePath?: string;
    keys: ProviderApiKeysStatus;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

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

type ProviderApiKeyField = "openrouterApiKey" | "openaiApiKey" | "anthropicApiKey" | "geminiApiKey";
type ProviderApiKeyClearField =
  | "clearOpenrouterApiKey"
  | "clearOpenaiApiKey"
  | "clearAnthropicApiKey"
  | "clearGeminiApiKey";

function toClearField(field: ProviderApiKeyField): ProviderApiKeyClearField {
  switch (field) {
    case "openrouterApiKey":
      return "clearOpenrouterApiKey";
    case "openaiApiKey":
      return "clearOpenaiApiKey";
    case "anthropicApiKey":
      return "clearAnthropicApiKey";
    case "geminiApiKey":
      return "clearGeminiApiKey";
    default:
      return "clearOpenrouterApiKey";
  }
}

type AdminAuthState = "loading" | "unauthenticated" | "password_change_required" | "authenticated";

function cloneConfig(config: OpenChatConfig): OpenChatConfig {
  return {
    backend: {
      database: {
        defaultAdapter: config.backend.database.defaultAdapter,
      },
      auth: {
        requireAuthenticationForSavedChats: config.backend.auth.requireAuthenticationForSavedChats,
      },
    },
    features: {
      allowGuestResponses: config.features.allowGuestResponses,
    },
    ai: {
      defaultModelProvider: config.ai.defaultModelProvider,
      allowUserModelProviderSelection: config.ai.allowUserModelProviderSelection,
      openrouter: {
        allowedModels: [...config.ai.openrouter.allowedModels],
        rateLimits: {
          guestRequestsPerDay: config.ai.openrouter.rateLimits.guestRequestsPerDay,
          memberRequestsPerDay: config.ai.openrouter.rateLimits.memberRequestsPerDay,
          adminRequestsPerDay: config.ai.openrouter.rateLimits.adminRequestsPerDay,
        },
      },
    },
    ui: {
      defaultTheme: config.ui.defaultTheme,
    },
  };
}

function parseOpenRouterAllowedModels(raw: string): string[] {
  const uniqueModels = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized.length > 0) {
      uniqueModels.add(normalized);
    }
  }

  return [...uniqueModels];
}

function validateSingleAuthModeDraft(draft: RuntimeEnvSettings): void {
  const issuers = parseIssuerArray(draft.auth.issuersJson);
  const issuersCount = issuers.length;
  const defaultProviderName = draft.auth.defaultProviderName.trim();

  if (draft.auth.localEnabled && issuersCount > 0) {
    throw new Error("Only one auth mode can be active. Disable local auth or clear auth issuers JSON.");
  }

  if (issuersCount > 1) {
    throw new Error("Only one OIDC issuer is supported at a time.");
  }

  if (draft.auth.localEnabled && defaultProviderName.length > 0) {
    throw new Error("Default provider must be empty when local auth is enabled.");
  }

  if (!draft.auth.localEnabled && issuersCount === 0 && defaultProviderName.length > 0) {
    throw new Error("Default provider requires a configured auth issuer.");
  }

  if (issuersCount === 1 && defaultProviderName.length > 0) {
    const configuredName = readIssuerName(issuers[0]);
    if (configuredName && configuredName !== defaultProviderName) {
      throw new Error("Default provider must match the configured issuer name.");
    }
  }
}

function parseIssuerArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Auth issuers JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Auth issuers JSON must be a JSON array.");
  }

  return parsed;
}

function readIssuerName(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const issuer = value as { name?: unknown };
  return typeof issuer.name === "string" ? issuer.name : null;
}

export default function AdminSettingsPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AdminAuthState>("loading");
  const [draft, setDraft] = useState<OpenChatConfig | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [isUsingDefaults, setIsUsingDefaults] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingApiKeys, setIsSavingApiKeys] = useState(false);
  const [isSavingRuntimeSettings, setIsSavingRuntimeSettings] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [apiKeysStatusMessage, setApiKeysStatusMessage] = useState<string | null>(null);
  const [runtimeSettingsStatusMessage, setRuntimeSettingsStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKeysErrorMessage, setApiKeysErrorMessage] = useState<string | null>(null);
  const [runtimeSettingsErrorMessage, setRuntimeSettingsErrorMessage] = useState<string | null>(null);
  const [apiKeysStatus, setApiKeysStatus] = useState<ProviderApiKeysStatus | null>(null);
  const [runtimeSettingsPath, setRuntimeSettingsPath] = useState<string | null>(null);
  const [runtimeSettingsDraft, setRuntimeSettingsDraft] = useState<RuntimeEnvSettings | null>(null);
  const [apiKeysDraft, setApiKeysDraft] = useState<Record<ProviderApiKeyField, string>>({
    openrouterApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    geminiApiKey: "",
  });
  const [apiKeysClearDraft, setApiKeysClearDraft] = useState<Record<ProviderApiKeyClearField, boolean>>({
    clearOpenrouterApiKey: false,
    clearOpenaiApiKey: false,
    clearAnthropicApiKey: false,
    clearGeminiApiKey: false,
  });

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

        await Promise.all([
          loadSiteSettings(),
          loadProviderApiKeys(),
          loadRuntimeSettings(),
        ]);
      } catch (error) {
        if (!isDisposed) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load admin settings session.");
          setAuthState("unauthenticated");
        }
      }
    }

    async function loadSiteSettings() {
      try {
        const response = await fetch("/api/v1/admin/settings", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const payload = (await response.json()) as AdminSettingsApiResponse;
        if (!response.ok) {
          if (response.status === 401) {
            if (!isDisposed) {
              setAuthState("unauthenticated");
            }
            return;
          }

          if (payload.error?.code === "admin_password_change_required") {
            if (!isDisposed) {
              setAuthState("password_change_required");
            }
            return;
          }

          throw new Error(payload.error?.message ?? `Unable to load site settings (${response.status})`);
        }

        if (!payload.data) {
          throw new Error("Admin settings response did not include data");
        }

        if (isDisposed) {
          return;
        }

        setDraft(cloneConfig(payload.data.config));
        setConfigPath(payload.data.filePath);
        setIsUsingDefaults(payload.data.usingDefaults);
        setErrorMessage(null);
      } catch (error) {
        if (!isDisposed) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load site settings.");
        }
      }
    }

    async function loadProviderApiKeys() {
      try {
        const response = await fetch("/api/v1/admin/api-keys", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as AdminApiKeysApiResponse;

        if (!response.ok) {
          if (response.status === 401) {
            if (!isDisposed) {
              setAuthState("unauthenticated");
            }
            return;
          }

          if (payload.error?.code === "admin_password_change_required") {
            if (!isDisposed) {
              setAuthState("password_change_required");
            }
            return;
          }

          throw new Error(payload.error?.message ?? `Unable to load API key settings (${response.status})`);
        }

        if (!payload.data || isDisposed) {
          return;
        }

        setApiKeysStatus(payload.data.keys);
        setApiKeysErrorMessage(null);
      } catch (error) {
        if (!isDisposed) {
          setApiKeysErrorMessage(error instanceof Error ? error.message : "Could not load API key settings.");
        }
      }
    }

    async function loadRuntimeSettings() {
      try {
        const response = await fetch("/api/v1/admin/runtime-settings", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as AdminRuntimeSettingsApiResponse;

        if (!response.ok) {
          if (response.status === 401) {
            if (!isDisposed) {
              setAuthState("unauthenticated");
            }
            return;
          }

          if (payload.error?.code === "admin_password_change_required") {
            if (!isDisposed) {
              setAuthState("password_change_required");
            }
            return;
          }

          throw new Error(payload.error?.message ?? `Unable to load runtime settings (${response.status})`);
        }

        if (!payload.data || isDisposed) {
          return;
        }

        setRuntimeSettingsPath(payload.data.filePath);
        setRuntimeSettingsDraft(payload.data.settings);
        setRuntimeSettingsErrorMessage(null);
      } catch (error) {
        if (!isDisposed) {
          setRuntimeSettingsErrorMessage(
            error instanceof Error ? error.message : "Could not load runtime settings.",
          );
        }
      }
    }

    void load();

    return () => {
      isDisposed = true;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || isSaving) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const payload = (await response.json()) as AdminSettingsApiResponse;
      if (!response.ok) {
        if (response.status === 401) {
          setAuthState("unauthenticated");
          return;
        }

        if (payload.error?.code === "admin_password_change_required") {
          setAuthState("password_change_required");
          return;
        }

        throw new Error(payload.error?.message ?? `Unable to save site settings (${response.status})`);
      }

      if (!payload.data) {
        throw new Error("Admin settings response did not include data");
      }

      setDraft(cloneConfig(payload.data.config));
      setConfigPath(payload.data.filePath);
      setIsUsingDefaults(payload.data.usingDefaults);
      setStatusMessage("Site settings saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save admin settings.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleApiKeyInputChange(field: ProviderApiKeyField, value: string) {
    setApiKeysDraft((previous) => ({
      ...previous,
      [field]: value,
    }));

    const clearField = toClearField(field);
    setApiKeysClearDraft((previous) => ({
      ...previous,
      [clearField]: false,
    }));
  }

  function handleApiKeyClearToggle(field: ProviderApiKeyField, checked: boolean) {
    const clearField = toClearField(field);
    setApiKeysClearDraft((previous) => ({
      ...previous,
      [clearField]: checked,
    }));

    if (checked) {
      setApiKeysDraft((previous) => ({
        ...previous,
        [field]: "",
      }));
    }
  }

  async function handleSaveApiKeys() {
    if (isSavingApiKeys) {
      return;
    }

    const payload: Partial<Record<ProviderApiKeyField, string | null>> = {};

    for (const field of [
      "openrouterApiKey",
      "openaiApiKey",
      "anthropicApiKey",
      "geminiApiKey",
    ] as const) {
      const clearField = toClearField(field);
      if (apiKeysClearDraft[clearField]) {
        payload[field] = null;
        continue;
      }

      const value = apiKeysDraft[field].trim();
      if (value.length > 0) {
        payload[field] = value;
      }
    }

    if (Object.keys(payload).length === 0) {
      setApiKeysStatusMessage(null);
      setApiKeysErrorMessage("Enter one or more API keys, or select a key to clear.");
      return;
    }

    setApiKeysErrorMessage(null);
    setApiKeysStatusMessage(null);
    setIsSavingApiKeys(true);

    try {
      const response = await fetch("/api/v1/admin/api-keys", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as AdminApiKeysApiResponse;
      if (!response.ok) {
        if (response.status === 401) {
          setAuthState("unauthenticated");
          return;
        }

        if (result.error?.code === "admin_password_change_required") {
          setAuthState("password_change_required");
          return;
        }

        throw new Error(result.error?.message ?? `Unable to save API keys (${response.status})`);
      }

      if (!result.data) {
        throw new Error("API key response did not include data");
      }

      setApiKeysStatus(result.data.keys);
      setApiKeysDraft({
        openrouterApiKey: "",
        openaiApiKey: "",
        anthropicApiKey: "",
        geminiApiKey: "",
      });
      setApiKeysClearDraft({
        clearOpenrouterApiKey: false,
        clearOpenaiApiKey: false,
        clearAnthropicApiKey: false,
        clearGeminiApiKey: false,
      });
      setApiKeysStatusMessage("API keys updated.");
    } catch (error) {
      setApiKeysErrorMessage(error instanceof Error ? error.message : "Could not save API keys.");
    } finally {
      setIsSavingApiKeys(false);
    }
  }

  async function handleSaveRuntimeSettings() {
    if (!runtimeSettingsDraft || isSavingRuntimeSettings) {
      return;
    }

    setRuntimeSettingsErrorMessage(null);
    setRuntimeSettingsStatusMessage(null);

    try {
      validateSingleAuthModeDraft(runtimeSettingsDraft);
    } catch (error) {
      setRuntimeSettingsErrorMessage(
        error instanceof Error ? error.message : "Could not validate runtime settings.",
      );
      return;
    }

    setIsSavingRuntimeSettings(true);

    try {
      const response = await fetch("/api/v1/admin/runtime-settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(runtimeSettingsDraft),
      });

      const payload = (await response.json()) as AdminRuntimeSettingsApiResponse;
      if (!response.ok) {
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

      if (!payload.data) {
        throw new Error("Runtime settings response did not include data");
      }

      setRuntimeSettingsPath(payload.data.filePath);
      setRuntimeSettingsDraft(payload.data.settings);
      setRuntimeSettingsStatusMessage("Runtime database/auth settings updated.");
    } catch (error) {
      setRuntimeSettingsErrorMessage(
        error instanceof Error ? error.message : "Could not save runtime settings.",
      );
    } finally {
      setIsSavingRuntimeSettings(false);
    }
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
      router.replace("/admin/login?returnTo=%2Fadmin%2Fsettings");
    }
  }

  if (authState === "loading") {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-2xl p-8">
          <p className="text-sm text-[color:var(--text-muted)]">Loading admin settings...</p>
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
            Sign in with the local admin password to access admin settings.
          </p>
          <Link
            href="/admin/login?returnTo=%2Fadmin%2Fsettings"
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
            Rotate the default admin password before managing admin settings.
          </p>
          <Link
            href="/admin/password?returnTo=%2Fadmin%2Fsettings"
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

      <section className="surface relative z-10 mx-auto w-full max-w-4xl p-5 sm:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">Site and Runtime Settings</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Local admin control plane for sitewide behavior and runtime environment configuration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/password?returnTo=%2Fadmin%2Fsettings"
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

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <section className="surface-soft px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Sitewide Access Policy</p>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Runtime database/auth wiring is managed in the Runtime Database and Auth section below.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="surface-soft flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-[color:var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={draft?.backend.auth.requireAuthenticationForSavedChats ?? true}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            backend: {
                              ...prev.backend,
                              auth: {
                                requireAuthenticationForSavedChats: event.target.checked,
                              },
                            },
                          }
                        : prev,
                    )
                  }
                />
                Require authentication for saved chats
              </label>
            </div>
          </section>

          <section className="surface-soft px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Product</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="surface-soft flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-[color:var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={draft?.features.allowGuestResponses ?? false}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            features: {
                              allowGuestResponses: event.target.checked,
                            },
                          }
                        : prev,
                    )
                  }
                />
                Allow guest responses
              </label>

              <div className="surface-soft rounded-lg border border-white/10 px-3 py-2 text-sm text-[color:var(--text-dim)]">
                Model provider is admin-managed. Users can only choose from the allowed model list.
              </div>

              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="default-theme">
                <span className="block">Default theme</span>
                <select
                  id="default-theme"
                  value={draft?.ui.defaultTheme ?? openChatConfig.ui.defaultTheme}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            ui: {
                              defaultTheme: event.target.value as OpenChatConfig["ui"]["defaultTheme"],
                            },
                          }
                        : prev,
                    )
                  }
                  className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  {OPENCHAT_THEME_OPTIONS.map((themeOption) => (
                    <option key={themeOption.id} value={themeOption.id}>
                      {themeOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="default-model-provider">
                <span className="block">Default model provider</span>
                <select
                  id="default-model-provider"
                  value={draft?.ai.defaultModelProvider ?? openChatConfig.ai.defaultModelProvider}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            ai: {
                              ...prev.ai,
                              defaultModelProvider: event.target.value as OpenChatConfig["ai"]["defaultModelProvider"],
                            },
                          }
                        : prev,
                    )
                  }
                  className="admin-select ai-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  {OPENCHAT_MODEL_PROVIDER_OPTIONS.map((providerOption) => (
                    <option key={providerOption.id} value={providerOption.id}>
                      {providerOption.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3">
              <p className="text-sm font-medium text-[color:var(--text-primary)]">OpenRouter policy</p>
              <p className="mt-1 text-xs text-[color:var(--text-dim)]">
                Admin-managed allowlist and daily request limits by role.
              </p>

              <div className="mt-3 grid gap-3">
                <label
                  className="block space-y-1 text-sm text-[color:var(--text-primary)]"
                  htmlFor="openrouter-allowed-models"
                >
                  <span className="block">Allowed models (one per line)</span>
                  <textarea
                    id="openrouter-allowed-models"
                    rows={6}
                    value={draft?.ai.openrouter.allowedModels.join("\n") ?? ""}
                    onChange={(event) => {
                      const nextModels = parseOpenRouterAllowedModels(event.target.value);
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              ai: {
                                ...prev.ai,
                                openrouter: {
                                  ...prev.ai.openrouter,
                                  allowedModels: nextModels,
                                },
                              },
                            }
                          : prev,
                      );
                    }}
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-xs outline-none"
                    placeholder="openai/gpt-4o-mini"
                    spellCheck={false}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label
                    className="space-y-1 text-sm text-[color:var(--text-primary)]"
                    htmlFor="openrouter-limit-guest"
                  >
                    <span className="block">Guest requests/day</span>
                    <input
                      id="openrouter-limit-guest"
                      type="number"
                      min={0}
                      max={1_000_000}
                      value={draft?.ai.openrouter.rateLimits.guestRequestsPerDay ?? 0}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                ai: {
                                  ...prev.ai,
                                  openrouter: {
                                    ...prev.ai.openrouter,
                                    rateLimits: {
                                      ...prev.ai.openrouter.rateLimits,
                                      guestRequestsPerDay: Number.isFinite(parsed)
                                        ? Math.max(0, Math.floor(parsed))
                                        : 0,
                                    },
                                  },
                                },
                              }
                            : prev,
                        );
                      }}
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label
                    className="space-y-1 text-sm text-[color:var(--text-primary)]"
                    htmlFor="openrouter-limit-member"
                  >
                    <span className="block">Member requests/day</span>
                    <input
                      id="openrouter-limit-member"
                      type="number"
                      min={0}
                      max={1_000_000}
                      value={draft?.ai.openrouter.rateLimits.memberRequestsPerDay ?? 0}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                ai: {
                                  ...prev.ai,
                                  openrouter: {
                                    ...prev.ai.openrouter,
                                    rateLimits: {
                                      ...prev.ai.openrouter.rateLimits,
                                      memberRequestsPerDay: Number.isFinite(parsed)
                                        ? Math.max(0, Math.floor(parsed))
                                        : 0,
                                    },
                                  },
                                },
                              }
                            : prev,
                        );
                      }}
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label
                    className="space-y-1 text-sm text-[color:var(--text-primary)]"
                    htmlFor="openrouter-limit-admin"
                  >
                    <span className="block">Admin requests/day</span>
                    <input
                      id="openrouter-limit-admin"
                      type="number"
                      min={0}
                      max={1_000_000}
                      value={draft?.ai.openrouter.rateLimits.adminRequestsPerDay ?? 0}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                ai: {
                                  ...prev.ai,
                                  openrouter: {
                                    ...prev.ai.openrouter,
                                    rateLimits: {
                                      ...prev.ai.openrouter.rateLimits,
                                      adminRequestsPerDay: Number.isFinite(parsed)
                                        ? Math.max(0, Math.floor(parsed))
                                        : 0,
                                    },
                                  },
                                },
                              }
                            : prev,
                        );
                      }}
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-soft px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Provider API Keys</p>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Save provider keys to server `.env` so the app can use OpenRouter, OpenAI, Anthropic, and Gemini.
            </p>

            <div className="mt-3 space-y-3">
              <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="admin-openrouter-api-key">
                <span className="flex items-center justify-between gap-2">
                  <span>OpenRouter API key</span>
                  <span className="text-xs text-[color:var(--text-dim)]">
                    {apiKeysStatus?.openrouterConfigured ? "Configured" : "Not set"}
                  </span>
                </span>
                <input
                  id="admin-openrouter-api-key"
                  type="password"
                  value={apiKeysDraft.openrouterApiKey}
                  onChange={(event) => handleApiKeyInputChange("openrouterApiKey", event.target.value)}
                  placeholder="sk-or-v1-..."
                  autoComplete="off"
                  disabled={isSavingApiKeys || apiKeysClearDraft.clearOpenrouterApiKey}
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-dim)]">
                  <input
                    type="checkbox"
                    checked={apiKeysClearDraft.clearOpenrouterApiKey}
                    onChange={(event) =>
                      handleApiKeyClearToggle("openrouterApiKey", event.target.checked)
                    }
                    disabled={isSavingApiKeys}
                  />
                  Clear saved key
                </label>
              </label>

              <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="admin-openai-api-key">
                <span className="flex items-center justify-between gap-2">
                  <span>OpenAI API key</span>
                  <span className="text-xs text-[color:var(--text-dim)]">
                    {apiKeysStatus?.openaiConfigured ? "Configured" : "Not set"}
                  </span>
                </span>
                <input
                  id="admin-openai-api-key"
                  type="password"
                  value={apiKeysDraft.openaiApiKey}
                  onChange={(event) => handleApiKeyInputChange("openaiApiKey", event.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  disabled={isSavingApiKeys || apiKeysClearDraft.clearOpenaiApiKey}
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-dim)]">
                  <input
                    type="checkbox"
                    checked={apiKeysClearDraft.clearOpenaiApiKey}
                    onChange={(event) => handleApiKeyClearToggle("openaiApiKey", event.target.checked)}
                    disabled={isSavingApiKeys}
                  />
                  Clear saved key
                </label>
              </label>

              <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="admin-anthropic-api-key">
                <span className="flex items-center justify-between gap-2">
                  <span>Anthropic API key</span>
                  <span className="text-xs text-[color:var(--text-dim)]">
                    {apiKeysStatus?.anthropicConfigured ? "Configured" : "Not set"}
                  </span>
                </span>
                <input
                  id="admin-anthropic-api-key"
                  type="password"
                  value={apiKeysDraft.anthropicApiKey}
                  onChange={(event) => handleApiKeyInputChange("anthropicApiKey", event.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  disabled={isSavingApiKeys || apiKeysClearDraft.clearAnthropicApiKey}
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-dim)]">
                  <input
                    type="checkbox"
                    checked={apiKeysClearDraft.clearAnthropicApiKey}
                    onChange={(event) =>
                      handleApiKeyClearToggle("anthropicApiKey", event.target.checked)
                    }
                    disabled={isSavingApiKeys}
                  />
                  Clear saved key
                </label>
              </label>

              <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="admin-gemini-api-key">
                <span className="flex items-center justify-between gap-2">
                  <span>Gemini API key (GOOGLE_API_KEY)</span>
                  <span className="text-xs text-[color:var(--text-dim)]">
                    {apiKeysStatus?.geminiConfigured ? "Configured" : "Not set"}
                  </span>
                </span>
                <input
                  id="admin-gemini-api-key"
                  type="password"
                  value={apiKeysDraft.geminiApiKey}
                  onChange={(event) => handleApiKeyInputChange("geminiApiKey", event.target.value)}
                  placeholder="AIza..."
                  autoComplete="off"
                  disabled={isSavingApiKeys || apiKeysClearDraft.clearGeminiApiKey}
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-[color:var(--text-dim)]">
                  <input
                    type="checkbox"
                    checked={apiKeysClearDraft.clearGeminiApiKey}
                    onChange={(event) => handleApiKeyClearToggle("geminiApiKey", event.target.checked)}
                    disabled={isSavingApiKeys}
                  />
                  Clear saved key
                </label>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveApiKeys()}
                  disabled={isSavingApiKeys}
                  className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-semibold text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/14 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingApiKeys ? "Saving keys..." : "Save API keys"}
                </button>
              </div>

              {apiKeysStatusMessage ? (
                <p className="text-sm text-[color:var(--accent-primary-strong)]">{apiKeysStatusMessage}</p>
              ) : null}
              {apiKeysErrorMessage ? (
                <p className="text-sm text-[color:var(--accent-secondary-strong)]">{apiKeysErrorMessage}</p>
              ) : null}
            </div>
          </section>

          <section className="surface-soft px-4 py-3 text-xs text-[color:var(--text-dim)] sm:px-5">
            <p>Runtime env file: {runtimeSettingsPath ?? ".env"}</p>
            <p className="mt-1">Config file: {configPath ?? "data/site-settings.json"}</p>
            <p className="mt-1">
              Mode: {isUsingDefaults ? "Using defaults from openchat.config.ts" : "Using saved overrides"}
            </p>
          </section>

          <section className="surface-soft px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
              Runtime Database and Auth (.env)
            </p>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Edit server runtime settings for database and auth providers. Only one auth mode can be active at a time.
            </p>

            {runtimeSettingsDraft ? (
              <div className="mt-3 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-db-adapter">
                    <span className="block">Database adapter (BACKEND_DB_ADAPTER)</span>
                    <select
                      id="runtime-db-adapter"
                      value={runtimeSettingsDraft.database.adapter}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
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

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-db-url">
                    <span className="block">Database URL (DATABASE_URL)</span>
                    <input
                      id="runtime-db-url"
                      type="password"
                      value={runtimeSettingsDraft.database.databaseUrl}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
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
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-default-provider">
                    <span className="block">Default provider (BACKEND_AUTH_DEFAULT_PROVIDER)</span>
                    <input
                      id="runtime-auth-default-provider"
                      type="text"
                      value={runtimeSettingsDraft.auth.defaultProviderName}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  defaultProviderName: event.target.value,
                                },
                              }
                            : previous,
                        )
                      }
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                      placeholder="auth0"
                      disabled={runtimeSettingsDraft.auth.localEnabled}
                    />
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-clock-skew">
                    <span className="block">Clock skew seconds (BACKEND_AUTH_CLOCK_SKEW_SECONDS)</span>
                    <input
                      id="runtime-auth-clock-skew"
                      type="number"
                      min={0}
                      max={300}
                      value={runtimeSettingsDraft.auth.clockSkewSeconds}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  clockSkewSeconds: Number.isFinite(parsed) ? parsed : 60,
                                },
                              }
                            : previous,
                        );
                      }}
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-local-enabled">
                    <span className="block">Enable local auth (BACKEND_AUTH_LOCAL_ENABLED)</span>
                    <select
                      id="runtime-auth-local-enabled"
                      value={runtimeSettingsDraft.auth.localEnabled ? "true" : "false"}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  localEnabled: event.target.value === "true",
                                },
                              }
                            : previous,
                        )
                      }
                      className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-local-cookie-name">
                    <span className="block">Local auth cookie name (BACKEND_AUTH_LOCAL_COOKIE_NAME)</span>
                    <input
                      id="runtime-auth-local-cookie-name"
                      type="text"
                      value={runtimeSettingsDraft.auth.localCookieName}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  localCookieName: event.target.value,
                                },
                              }
                            : previous,
                        )
                      }
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-local-max-age">
                    <span className="block">Local session max age (BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS)</span>
                    <input
                      id="runtime-auth-local-max-age"
                      type="number"
                      min={300}
                      max={60 * 60 * 24 * 90}
                      value={runtimeSettingsDraft.auth.localSessionMaxAgeSeconds}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  localSessionMaxAgeSeconds: Number.isFinite(parsed) ? Math.max(300, Math.floor(parsed)) : 300,
                                },
                              }
                            : previous,
                        );
                      }}
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-secure-cookies">
                    <span className="block">Secure cookies (BACKEND_SESSION_SECURE_COOKIES)</span>
                    <select
                      id="runtime-secure-cookies"
                      value={runtimeSettingsDraft.auth.sessionSecureCookiesMode}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  sessionSecureCookiesMode: event.target
                                    .value as RuntimeEnvSettings["auth"]["sessionSecureCookiesMode"],
                                },
                              }
                            : previous,
                        )
                      }
                      className="admin-select w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    >
                      <option value="auto">auto (by NODE_ENV)</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-session-cookie-name">
                    <span className="block">Session cookie name (BACKEND_SESSION_COOKIE_NAME)</span>
                    <input
                      id="runtime-session-cookie-name"
                      type="text"
                      value={runtimeSettingsDraft.auth.sessionCookieName}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  sessionCookieName: event.target.value,
                                },
                              }
                            : previous,
                        )
                      }
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-flow-cookie-name">
                    <span className="block">Auth flow cookie name (BACKEND_AUTH_FLOW_COOKIE_NAME)</span>
                    <input
                      id="runtime-flow-cookie-name"
                      type="text"
                      value={runtimeSettingsDraft.auth.flowCookieName}
                      onChange={(event) =>
                        setRuntimeSettingsDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                auth: {
                                  ...previous.auth,
                                  flowCookieName: event.target.value,
                                },
                              }
                            : previous,
                        )
                      }
                      className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                    />
                  </label>
                </div>

                <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="runtime-auth-issuers-json">
                  <span className="block">Auth issuers JSON (BACKEND_AUTH_ISSUERS)</span>
                  <span className="block text-xs text-[color:var(--text-dim)]">
                    Leave empty for local auth, or set exactly one issuer for OIDC.
                  </span>
                  <textarea
                    id="runtime-auth-issuers-json"
                    rows={8}
                    value={runtimeSettingsDraft.auth.issuersJson}
                    onChange={(event) =>
                      setRuntimeSettingsDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              auth: {
                                ...previous.auth,
                                issuersJson: event.target.value,
                              },
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-mono text-xs outline-none"
                    placeholder='[{"name":"auth0",...}]'
                    spellCheck={false}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveRuntimeSettings()}
                    disabled={isSavingRuntimeSettings}
                    className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-semibold text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/14 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingRuntimeSettings ? "Saving runtime settings..." : "Save runtime settings"}
                  </button>
                </div>

                {runtimeSettingsStatusMessage ? (
                  <p className="text-sm text-[color:var(--accent-primary-strong)]">{runtimeSettingsStatusMessage}</p>
                ) : null}
                {runtimeSettingsErrorMessage ? (
                  <p className="text-sm text-[color:var(--accent-secondary-strong)]">{runtimeSettingsErrorMessage}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">Loading runtime settings...</p>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSaving || !draft}
              className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isSaving ? "Saving..." : "Save site settings"}
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setDraft(cloneConfig(openChatConfig));
                setStatusMessage("Draft reset to defaults.");
                setErrorMessage(null);
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            >
              Reset draft
            </button>
          </div>

          {statusMessage ? <p className="text-sm text-[color:var(--accent-primary-strong)]">{statusMessage}</p> : null}
          {errorMessage ? <p className="text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
        </form>
      </section>
    </main>
  );
}
