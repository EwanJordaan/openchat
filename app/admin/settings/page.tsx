"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { type CurrentUserData, fetchCurrentUser } from "@/app/lib/current-user";
import { OPENCHAT_THEME_OPTIONS } from "@/shared/themes";
import { openChatConfig, type OpenChatConfig } from "@/openchat.config";

interface AdminSettingsApiResponse {
  data?: {
    filePath: string;
    usingDefaults: boolean;
    config: OpenChatConfig;
  };
}

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
    ui: {
      defaultTheme: config.ui.defaultTheme,
    },
  };
}

export default function AdminSettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUserData | null | undefined>(undefined);
  const [draft, setDraft] = useState<OpenChatConfig | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [isUsingDefaults, setIsUsingDefaults] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = useMemo(() => currentUser?.principal.roles.includes("admin") ?? false, [currentUser]);

  useEffect(() => {
    let isDisposed = false;

    async function loadAdminSettings() {
      try {
        const user = await fetchCurrentUser();
        if (isDisposed) {
          return;
        }

        setCurrentUser(user);
        if (!user || !user.principal.roles.includes("admin")) {
          return;
        }

        const response = await fetch("/api/v1/admin/settings", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Unable to load site settings (${response.status})`);
        }

        const payload = (await response.json()) as AdminSettingsApiResponse;
        if (!payload.data) {
          throw new Error("Admin settings response did not include data");
        }

        if (isDisposed) {
          return;
        }

        setDraft(cloneConfig(payload.data.config));
        setConfigPath(payload.data.filePath);
        setIsUsingDefaults(payload.data.usingDefaults);
      } catch {
        if (!isDisposed) {
          setErrorMessage("Could not load admin settings right now.");
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminSettings();

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

      if (!response.ok) {
        throw new Error(`Unable to save site settings (${response.status})`);
      }

      const payload = (await response.json()) as AdminSettingsApiResponse;
      if (!payload.data) {
        throw new Error("Admin settings response did not include data");
      }

      setDraft(cloneConfig(payload.data.config));
      setConfigPath(payload.data.filePath);
      setIsUsingDefaults(payload.data.usingDefaults);
      setStatusMessage("Site settings saved.");
    } catch {
      setErrorMessage("Could not save admin settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || currentUser === undefined) {
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

  if (!currentUser) {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-2xl p-8">
          <p className="text-sm font-medium text-[color:var(--text-primary)]">Sign in as an admin to manage site settings.</p>
          <Link
            href="/login?returnTo=%2Fadmin%2Fsettings"
            className="mt-4 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
          >
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-2xl p-8">
          <p className="text-sm font-medium text-[color:var(--text-primary)]">You need the admin role to view this page.</p>
          <p className="mt-2 text-xs text-[color:var(--text-dim)]">Current roles: {currentUser.principal.roles.join(", ") || "none"}</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
          >
            Back to app
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
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">Site Settings</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">Update central config values without editing files by hand.</p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
          >
            Back to app
          </Link>
        </header>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <section className="surface-soft px-4 py-4 sm:px-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Backend</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="db-adapter">
                <span className="block">Default database adapter</span>
                <select
                  id="db-adapter"
                  value={draft?.backend.database.defaultAdapter ?? openChatConfig.backend.database.defaultAdapter}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            backend: {
                              ...prev.backend,
                              database: {
                                defaultAdapter: event.target.value as OpenChatConfig["backend"]["database"]["defaultAdapter"],
                              },
                            },
                          }
                        : prev,
                    )
                  }
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  <option value="postgres">postgres</option>
                  <option value="convex">convex</option>
                </select>
              </label>

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
                  className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                >
                  {OPENCHAT_THEME_OPTIONS.map((themeOption) => (
                    <option key={themeOption.id} value={themeOption.id}>
                      {themeOption.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="surface-soft px-4 py-3 text-xs text-[color:var(--text-dim)] sm:px-5">
            <p>Config file: {configPath ?? "data/site-settings.json"}</p>
            <p className="mt-1">Mode: {isUsingDefaults ? "Using defaults from openchat.config.ts" : "Using saved overrides"}</p>
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
