"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Save, ShieldAlert } from "lucide-react";

import type { Actor, ModelOption, PublicAppSettings, RoleLimit } from "@/lib/types";

interface ProviderItem {
  id: string;
  provider: string;
  baseUrl: string;
  hasApiKey: boolean;
  isEnabled: boolean;
  updatedAt: string;
}

interface UserItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  roles: Array<"user" | "admin">;
}

interface AdminPayload {
  settings: PublicAppSettings;
  providers: ProviderItem[];
  models: ModelOption[];
  roleLimits: RoleLimit[];
  users: UserItem[];
}

export function parseErrorMessage(raw: string) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error || null;
  } catch {
    return null;
  }
}

export function AdminDashboard() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});

  const patchData = useCallback((updater: (current: AdminPayload) => AdminPayload) => {
    setData((current) => (current ? updater(current) : current));
  }, []);

  const fetchAdminConfig = useCallback(async () => {
    const response = await fetch("/api/admin/config", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AdminPayload;
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const sessionData = (await sessionResponse.json()) as { actor: Actor };
      if (!alive) return;
      setActor(sessionData.actor);

      if (sessionData.actor.type !== "user" || !sessionData.actor.roles.includes("admin")) {
        setLoading(false);
        return;
      }

      const payload = await fetchAdminConfig();
      if (!payload) {
        if (alive) {
          setStatus("Failed to load admin dashboard");
          setLoading(false);
        }
        return;
      }

      if (!alive) return;
      setData(payload);
      setLoading(false);
    };

    void run();
    return () => {
      alive = false;
    };
  }, [fetchAdminConfig]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);

    const payload = await fetchAdminConfig();
    if (!payload) {
      setStatus("Failed to load admin dashboard");
      setLoading(false);
      return;
    }
    setData(payload);
    setLoading(false);
  }, [fetchAdminConfig]);

  const modelsById = useMemo(() => {
    const map = new Map<string, ModelOption>();
    for (const model of data?.models || []) {
      map.set(model.id, model);
    }
    return map;
  }, [data?.models]);

  async function update(action: unknown) {
    const response = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const raw = await response.text();
    if (!response.ok) {
      setStatus(parseErrorMessage(raw) || "Failed to save changes");
      return false;
    }
    setStatus("Saved.");
    await load();
    return true;
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <LoaderCircle size={22} className="spin" />
        Loading admin dashboard...
      </div>
    );
  }

  if (!actor || actor.type !== "user" || !actor.roles.includes("admin")) {
    return (
      <div className="settings-shell">
        <h1>Admin dashboard</h1>
        <p>You need the admin role to view system settings and provider configuration.</p>
        <Link href="/" className="settings-link">
          Return to chat
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="settings-shell">
        <h1>Admin dashboard</h1>
        <p>{status || "No admin data available"}</p>
      </div>
    );
  }

  return (
    <div className="settings-shell">
      <div className="settings-topbar">
        <div>
          <p className="eyebrow">Control center</p>
          <h1>Admin dashboard</h1>
          <p>Manage guest access, model permissions, role limits, provider keys, and user roles.</p>
        </div>
        <Link href="/" className="settings-link">
          Return to chat
        </Link>
      </div>

      <section className="settings-grid">
        <article>
          <h2>Guest access</h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={data.settings.guestEnabled}
              onChange={(event) => {
                const guestEnabled = event.target.checked;
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          guestEnabled,
                        },
                      }
                    : prev,
                );
              }}
            />
            Enable guest chatting
          </label>
          <label>
            Default model
            <select
              value={data.settings.defaultModelId}
              onChange={(event) => {
                patchData((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    defaultModelId: event.target.value,
                  },
                }));
              }}
            >
              {data.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </select>
          </label>
          <p className="subtle">Guest allowed models are controlled per-model below.</p>
          <button
            type="button"
            onClick={() =>
              void update({
                action: "settings",
                payload: {
                  guestEnabled: data.settings.guestEnabled,
                  defaultModelId: data.settings.defaultModelId,
                  guestAllowedModels: data.models.filter((model) => model.isGuestAllowed).map((model) => model.id),
                },
              })
            }
          >
            <Save size={14} />
            Save guest settings
          </button>
        </article>

        <article>
          <h2>Providers</h2>
          <div className="stacked-list">
            {data.providers.map((provider) => (
              <div key={provider.id} className="stacked-item">
                <h3>{provider.provider.toUpperCase()}</h3>
                <label>
                  Base URL
                  <input
                    value={provider.baseUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      patchData((current) => ({
                        ...current,
                        providers: current.providers.map((item) =>
                          item.id === provider.id
                            ? {
                                ...item,
                                baseUrl: value,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    placeholder={provider.hasApiKey ? "Configured (leave blank to keep current key)" : "Not configured"}
                    value={providerKeys[provider.provider] || ""}
                    onChange={(event) =>
                      setProviderKeys((prev) => ({
                        ...prev,
                        [provider.provider]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={provider.isEnabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchData((current) => ({
                        ...current,
                        providers: current.providers.map((item) =>
                          item.id === provider.id
                            ? {
                                ...item,
                                isEnabled: checked,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                  Provider enabled
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void update({
                      action: "provider",
                      payload: {
                        provider: provider.provider,
                        baseUrl: provider.baseUrl,
                        isEnabled: provider.isEnabled,
                        apiKey: providerKeys[provider.provider] || undefined,
                      },
                    })
                  }
                >
                  <Save size={14} />
                  Save provider
                </button>
              </div>
            ))}
          </div>
        </article>

        <article>
          <h2>Models</h2>
          <div className="stacked-list">
            {data.models.map((model) => (
              <div key={model.id} className="stacked-item">
                <h3>{model.displayName}</h3>
                <p className="subtle">{model.description}</p>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={model.isEnabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchData((current) => ({
                        ...current,
                        models: current.models.map((item) =>
                          item.id === model.id
                            ? {
                                ...item,
                                isEnabled: checked,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                  Enabled
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={model.isGuestAllowed}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchData((current) => ({
                        ...current,
                        models: current.models.map((item) =>
                          item.id === model.id
                            ? {
                                ...item,
                                isGuestAllowed: checked,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                  Guest allowed
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={model.isDefault}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patchData((current) => ({
                        ...current,
                        models: current.models.map((item) => ({
                          ...item,
                          isDefault: item.id === model.id ? checked : checked ? false : item.isDefault,
                        })),
                      }));
                    }}
                  />
                  Default model
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void update({
                      action: "model",
                      payload: {
                        id: model.id,
                        isEnabled: model.isEnabled,
                        isGuestAllowed: model.isGuestAllowed,
                        isDefault: model.isDefault,
                        maxOutputTokens: model.maxOutputTokens,
                      },
                    })
                  }
                >
                  <Save size={14} />
                  Save model
                </button>
              </div>
            ))}
          </div>
        </article>

        <article>
          <h2>Role limits</h2>
          <div className="stacked-list">
            {data.roleLimits.map((limit) => (
              <div key={limit.role} className="stacked-item">
                <h3>{limit.role.toUpperCase()}</h3>
                <label>
                  Messages / day
                  <input
                    type="number"
                    value={limit.dailyMessageLimit}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      patchData((current) => ({
                        ...current,
                        roleLimits: current.roleLimits.map((item) =>
                          item.role === limit.role
                            ? {
                                ...item,
                                dailyMessageLimit: value,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                </label>
                <label>
                  Max attachment count
                  <input
                    type="number"
                    value={limit.maxAttachmentCount}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      patchData((current) => ({
                        ...current,
                        roleLimits: current.roleLimits.map((item) =>
                          item.role === limit.role
                            ? {
                                ...item,
                                maxAttachmentCount: value,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                </label>
                <label>
                  Max attachment MB
                  <input
                    type="number"
                    value={limit.maxAttachmentMb}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      patchData((current) => ({
                        ...current,
                        roleLimits: current.roleLimits.map((item) =>
                          item.role === limit.role
                            ? {
                                ...item,
                                maxAttachmentMb: value,
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void update({
                      action: "roleLimit",
                      payload: limit,
                    })
                  }
                >
                  <Save size={14} />
                  Save limit
                </button>
              </div>
            ))}
          </div>
        </article>

        <article>
          <h2>Users</h2>
          <div className="stacked-list">
            {data.users.map((user) => (
              <div key={user.id} className="stacked-item">
                <h3>{user.name}</h3>
                <p className="subtle">{user.email}</p>
                <label>
                  Role
                  <select
                    value={user.roles.includes("admin") ? "admin" : "user"}
                    onChange={(event) => {
                      const value = event.target.value as "user" | "admin";
                      patchData((current) => ({
                        ...current,
                        users: current.users.map((item) =>
                          item.id === user.id
                            ? {
                                ...item,
                                roles: value === "admin" ? ["user", "admin"] : ["user"],
                              }
                            : item,
                        ),
                      }));
                    }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void update({
                      action: "userRoles",
                      payload: {
                        userId: user.id,
                        roles: user.roles,
                      },
                    })
                  }
                >
                  <Save size={14} />
                  Save role
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      {status ? (
        <p className="settings-status">
          {status.includes("Failed") ? <ShieldAlert size={14} /> : null}
          {status}
        </p>
      ) : null}

      {data.settings.guestAllowedModels.some((id) => !modelsById.has(id)) ? (
        <p className="settings-status">Some guest model IDs are stale and will be ignored until updated.</p>
      ) : null}
    </div>
  );
}
