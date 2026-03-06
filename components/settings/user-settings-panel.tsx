"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

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

export function UserSettingsPanel() {
  const { setMode } = useTheme();
  const [actor, setActor] = useState<Actor | null>(null);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="settings-loading">
        <LoaderCircle className="spin" size={22} />
        Loading settings...
      </div>
    );
  }

  if (!actor || actor.type !== "user") {
    return (
      <div className="settings-shell">
        <h1>User settings</h1>
        <p>Sign in to personalize your chat behavior, language, and appearance preferences.</p>
        <Link href="/" className="settings-link">
          Go to chat and sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="settings-shell">
      <div className="settings-topbar">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>User settings</h1>
          <p>Personalize your account and chat defaults. These settings apply to all future chats.</p>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
            Save changes
          </button>
        </div>
      </div>

      <section className="settings-grid">
        <article>
          <h2>Profile</h2>
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
            Theme preference
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
}
