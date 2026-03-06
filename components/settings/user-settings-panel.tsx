"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import type { Actor, UserSettings } from "@/lib/types";

const defaultSettings: UserSettings = {
  theme: "system",
  compactMode: false,
  enterToSend: true,
  showTokens: false,
  timezone: "UTC",
  language: "en",
  autoTitleChats: true,
};

interface UserSettingsPanelProps {
  mode?: "page" | "overlay";
  onClose?: () => void;
}

export function UserSettingsPanel({ mode = "page", onClose }: UserSettingsPanelProps) {
  const isOverlay = mode === "overlay";
  const { setMode } = useTheme();
  const [actor, setActor] = useState<Actor | null>(null);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastSavedSettingsRef = useRef<string>(JSON.stringify(defaultSettings));
  const saveRequestIdRef = useRef(0);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSerializedSettingsRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const persistSettings = useCallback(
    async (serializedSettings: string, requestId: number, options?: { immediate?: boolean }) => {
      if (!actor || actor.type !== "user") {
        return;
      }

      if (mountedRef.current) {
        setSaving(true);
        setMessage("Saving changes...");
      }

      try {
        const response = await fetch("/api/settings/user", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: serializedSettings,
          keepalive: options?.immediate ?? false,
        });
        const data = (await response.json()) as { error?: string };

        if (requestId !== saveRequestIdRef.current) {
          return;
        }

        if (!response.ok) {
          if (!mountedRef.current) {
            return;
          }
          setMessage(data.error || "Failed to save settings");
          setSaving(false);
          return;
        }

        lastSavedSettingsRef.current = serializedSettings;
        pendingSerializedSettingsRef.current = null;

        if (!mountedRef.current) {
          return;
        }
        setMessage("Saved");
        setSaving(false);
      } catch {
        if (requestId !== saveRequestIdRef.current || !mountedRef.current) {
          return;
        }
        setMessage("Failed to save settings");
        setSaving(false);
      }
    },
    [actor],
  );

  const flushPendingSave = useCallback(() => {
    if (loading || !actor || actor.type !== "user") {
      return;
    }

    const serializedSettings = pendingSerializedSettingsRef.current ?? JSON.stringify(settings);
    if (serializedSettings === lastSavedSettingsRef.current) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    pendingSerializedSettingsRef.current = serializedSettings;
    const requestId = ++saveRequestIdRef.current;
    void persistSettings(serializedSettings, requestId, { immediate: true });
  }, [actor, loading, persistSettings, settings]);

  const requestClose = useCallback(() => {
    if (!onClose) {
      return;
    }
    flushPendingSave();
    onClose();
  }, [flushPendingSave, onClose]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const sessionData = (await sessionResponse.json()) as { actor: Actor };
      if (!alive) return;
      setActor(sessionData.actor);

      if (sessionData.actor.type === "user") {
        const response = await fetch("/api/settings/user", { cache: "no-store" });
        if (response.ok && alive) {
          const data = (await response.json()) as { settings: UserSettings };
          setSettings(data.settings);
          setMode(data.settings.theme);
          lastSavedSettingsRef.current = JSON.stringify(data.settings);
        }
      }

      if (alive) {
        setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [setMode]);

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(data.error || "Failed to save settings");
        return;
      }

      setMessage("Settings updated successfully.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (loading || !actor || actor.type !== "user") return;

    const nextSerialized = JSON.stringify(settings);
    if (nextSerialized === lastSavedSettingsRef.current) return;

    pendingSerializedSettingsRef.current = nextSerialized;
    const requestId = ++saveRequestIdRef.current;
    const timeout = window.setTimeout(async () => {
      await persistSettings(nextSerialized, requestId);
    }, 500);

    saveTimeoutRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (saveTimeoutRef.current === timeout) {
        saveTimeoutRef.current = null;
      }
    };
  }, [actor, loading, persistSettings, settings]);

  const panelContent = loading ? (
    <div className="settings-loading">
      <LoaderCircle className="spin" size={22} />
      Loading settings...
    </div>
  ) : !actor || actor.type !== "user" ? (
    <div className={`settings-shell ${isOverlay ? "settings-shell-overlay" : ""}`}>
      <div className="settings-topbar">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>User settings</h1>
          <p>Sign in to personalize your chat behavior, language, and appearance preferences.</p>
        </div>
        {isOverlay && onClose ? (
          <div className="settings-actions">
            <button type="button" onClick={requestClose} className="settings-close-button" aria-label="Close settings">
              <X size={14} />
            </button>
          </div>
        ) : null}
      </div>
      <div className="settings-grid user-settings-grid">
        <article>
          <h2>Sign in required</h2>
          <p className="subtle">You need a signed-in account to save and sync personal settings.</p>
          <Link href="/" className="settings-link">
            Go to chat and sign in
          </Link>
        </article>
      </div>
    </div>
  ) : (
    <div className={`settings-shell ${isOverlay ? "settings-shell-overlay" : ""}`}>
      <div className="settings-topbar">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>User settings</h1>
          <p>Personalize your account and chat defaults. These settings apply to future chats.</p>
        </div>
        <div className="settings-actions">
          {saving ? (
            <span className="settings-sync-indicator">
              <LoaderCircle size={13} className="spin" /> Saving...
            </span>
          ) : null}
          {isOverlay && onClose ? (
            <button type="button" onClick={requestClose} className="settings-close-button" aria-label="Close settings">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <section className="settings-grid user-settings-grid">
        <article>
          <h2>Account</h2>
          <p className="subtle">Profile details are read-only and sourced from your sign-in provider.</p>
          <label>
            Name
            <input value={actor.user.name} disabled />
          </label>
          <label>
            Email
            <input value={actor.user.email} disabled />
          </label>
        </article>

        <article>
          <h2>Appearance</h2>
          <label>
            Theme
            <select
              value={settings.theme}
              onChange={(event) => {
                const theme = event.target.value as UserSettings["theme"];
                setSettings((prev) => ({
                  ...prev,
                  theme,
                }));
                setMode(theme);
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.compactMode}
              onChange={(event) => setSettings((prev) => ({ ...prev, compactMode: event.target.checked }))}
            />
            Compact chat layout
          </label>
        </article>

        <article>
          <h2>Chat behavior</h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.enterToSend}
              onChange={(event) => setSettings((prev) => ({ ...prev, enterToSend: event.target.checked }))}
            />
            Press Enter to send
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.autoTitleChats}
              onChange={(event) => setSettings((prev) => ({ ...prev, autoTitleChats: event.target.checked }))}
            />
            Auto-title new conversations
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.showTokens}
              onChange={(event) => setSettings((prev) => ({ ...prev, showTokens: event.target.checked }))}
            />
            Show token metadata
          </label>
        </article>

        <article>
          <h2>Locale</h2>
          <label>
            Language
            <select
              value={settings.language}
              onChange={(event) => setSettings((prev) => ({ ...prev, language: event.target.value }))}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="ja">Japanese</option>
            </select>
          </label>
          <label>
            Timezone
            <input
              value={settings.timezone}
              onChange={(event) => setSettings((prev) => ({ ...prev, timezone: event.target.value }))}
              placeholder="UTC"
            />
          </label>
        </article>
      </section>

      {message ? <p className="settings-status">{message}</p> : null}
    </div>
  );

  if (!isOverlay) {
    return panelContent;
  }

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="User settings"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) {
          requestClose();
        }
      }}
    >
      <div className="settings-overlay-panel">{panelContent}</div>
    </div>
  );
}
