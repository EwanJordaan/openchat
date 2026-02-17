"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { clearChatCache } from "@/app/lib/chats";
import { clearCurrentUserCache, type CurrentUserData, fetchCurrentUser, getDisplayName, setCurrentUserCache } from "@/app/lib/current-user";
import { getPublicSiteConfig } from "@/app/lib/site-config";
import { initializeTheme, setThemePreference } from "@/app/lib/theme";
import { ProfileAvatar } from "@/components/profile-avatar";
import { OPENCHAT_THEME_OPTIONS, resolveThemeId, type ThemeId } from "@/shared/themes";

interface UserPayloadResponse {
  data?: {
    user: CurrentUserData["user"];
  };
}

type SettingsSection = "general" | "account";

const publicSiteConfig = getPublicSiteConfig();

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(publicSiteConfig.ui.defaultTheme);
  const [generalStatusMessage, setGeneralStatusMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const initialTheme = initializeTheme(publicSiteConfig.ui.defaultTheme);
    setSelectedTheme(initialTheme);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCurrentUser() {
      try {
        const data = await fetchCurrentUser(controller.signal);
        setCurrentUser(data);
        setNameDraft(data?.user.name ?? "");
      } catch {
        setErrorMessage("Could not load your account settings right now.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadCurrentUser();

    return () => {
      controller.abort();
    };
  }, [router]);

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || isSavingName) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSavingName(true);

    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: nameDraft.trim().length > 0 ? nameDraft : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Profile update failed");
      }

      const payload = (await response.json()) as UserPayloadResponse;
      if (!payload.data || !payload.data.user) {
        throw new Error("Missing user data");
      }

      const nextUser = payload.data.user;

      const nextCurrentUser: CurrentUserData = {
        ...currentUser,
        user: nextUser,
      };

      setCurrentUser(nextCurrentUser);
      setCurrentUserCache(nextCurrentUser);
      setNameDraft(nextUser.name ?? "");
      setStatusMessage("Profile saved.");
    } catch {
      setErrorMessage("Could not save your profile. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentUser || isUploadingAvatar) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.set("avatar", file);

      const response = await fetch("/api/v1/me/avatar", {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Avatar upload failed");
      }

      const payload = (await response.json()) as UserPayloadResponse;
      if (!payload.data || !payload.data.user) {
        throw new Error("Missing user data");
      }

      const nextUser = payload.data.user;

      const nextCurrentUser: CurrentUserData = {
        ...currentUser,
        user: nextUser,
      };

      setCurrentUser(nextCurrentUser);
      setCurrentUserCache(nextCurrentUser);
      setStatusMessage("Profile photo updated.");
    } catch {
      setErrorMessage("Could not upload that image. Use PNG/JPEG/WEBP/GIF up to 2MB.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveAvatar() {
    if (!currentUser || isRemovingAvatar) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsRemovingAvatar(true);

    try {
      const response = await fetch("/api/v1/me/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Avatar delete failed");
      }

      const payload = (await response.json()) as UserPayloadResponse;
      if (!payload.data || !payload.data.user) {
        throw new Error("Missing user data");
      }

      const nextUser = payload.data.user;

      const nextCurrentUser: CurrentUserData = {
        ...currentUser,
        user: nextUser,
      };

      setCurrentUser(nextCurrentUser);
      setCurrentUserCache(nextCurrentUser);
      setStatusMessage("Profile photo removed.");
    } catch {
      setErrorMessage("Could not remove your profile photo right now.");
    } finally {
      setIsRemovingAvatar(false);
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
      });
    } finally {
      clearCurrentUserCache();
      clearChatCache();
      router.replace("/login");
    }
  }

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = resolveThemeId(event.target.value, publicSiteConfig.ui.defaultTheme);
    const nextThemeOption = OPENCHAT_THEME_OPTIONS.find((option) => option.id === nextTheme);

    setSelectedTheme(nextTheme);
    setThemePreference(nextTheme);
    setGeneralStatusMessage(`Theme updated to ${nextThemeOption?.label ?? nextTheme}.`);
  }

  if (isLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
        <section className="surface relative z-10 w-full max-w-xl p-8">
          <p className="text-sm text-[color:var(--text-muted)]">Loading settings...</p>
        </section>
      </main>
    );
  }

  const displayName = currentUser
    ? getDisplayName(currentUser.user.name, currentUser.user.email)
    : "Guest";
  const sections: Array<{ id: SettingsSection; label: string; description: string }> = [
    {
      id: "general",
      label: "General",
      description: "App behavior and defaults",
    },
    {
      id: "account",
      label: "Account",
      description: "Profile, identity, and security",
    },
  ];
  const selectedThemeOption = OPENCHAT_THEME_OPTIONS.find((option) => option.id === selectedTheme);

  return (
    <main className="relative min-h-screen p-4 sm:p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 mx-auto w-full max-w-5xl p-5 sm:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Preferences</p>
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">Settings</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">Separate your app defaults from account details.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            >
              Back to app
            </Link>
            {currentUser ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-[var(--accent-secondary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-secondary-strong)] transition hover:bg-[var(--accent-secondary)]/15"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/login?returnTo=%2Fsettings"
                className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <div className="mt-5 grid gap-4 lg:grid-cols-[230px_1fr] lg:gap-5">
          <aside className="surface-soft p-2.5 sm:p-3">
            <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Categories</p>
            <nav className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Settings sections">
              {sections.map((section) => {
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    aria-pressed={isActive}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/14"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        isActive
                          ? "text-[color:var(--accent-primary-strong)]"
                          : "text-[color:var(--text-primary)]"
                      }`}
                    >
                      {section.label}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--text-dim)]">{section.description}</p>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0">
            {activeSection === "general" ? (
              <section className="space-y-3">
                <header className="surface-soft px-4 py-3 sm:px-5 sm:py-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">General</p>
                  <h2 className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">App defaults</h2>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    Workspace-level preferences live here. Account profile and identity live in the Account section.
                  </p>
                </header>

                <div className="surface-soft px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">Language</p>
                      <p className="text-xs text-[color:var(--text-dim)]">UI language for labels and helper text.</p>
                    </div>
                    <span className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[color:var(--text-muted)]">
                      English (default)
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">Appearance</p>
                      <p className="text-xs text-[color:var(--text-dim)]">Pick a visual theme for this browser.</p>
                    </div>
                    <label className="sr-only" htmlFor="theme-select">
                      Theme
                    </label>
                    <select
                      id="theme-select"
                      value={selectedTheme}
                      onChange={handleThemeChange}
                      className="rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)] outline-none"
                    >
                      {OPENCHAT_THEME_OPTIONS.map((themeOption) => (
                        <option key={themeOption.id} value={themeOption.id}>
                          {themeOption.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="mt-2 text-xs text-[color:var(--text-dim)]">
                    {selectedThemeOption?.description} Config default: {publicSiteConfig.ui.defaultTheme}.
                  </p>
                  {generalStatusMessage ? (
                    <p className="mt-2 text-xs text-[color:var(--accent-primary-strong)]">{generalStatusMessage}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[color:var(--text-primary)]">Chat behavior</p>
                      <p className="text-xs text-[color:var(--text-dim)]">Composer shortcuts and response preferences.</p>
                    </div>
                    <span className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-xs text-[color:var(--text-muted)]">
                      Coming soon
                    </span>
                  </div>
                </div>
              </section>
            ) : (
              <section className="space-y-5">
                <header className="surface-soft px-4 py-3 sm:px-5 sm:py-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Account</p>
                  <h2 className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">Profile and identity</h2>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    Manage your public profile, authentication identity, and provider details.
                  </p>
                </header>

                {currentUser ? (
                  <>
                    <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
                      <div className="space-y-3">
                        <ProfileAvatar
                          name={currentUser.user.name}
                          email={currentUser.user.email}
                          hasAvatar={currentUser.user.hasAvatar}
                          avatarUpdatedAt={currentUser.user.avatarUpdatedAt}
                          sizeClassName="h-24 w-24"
                          textClassName="text-3xl"
                        />
                        <div className="space-y-2">
                          <label
                            htmlFor="avatar-file"
                            className="surface-soft block cursor-pointer px-3 py-2 text-center text-sm font-medium text-[color:var(--text-primary)] transition hover:border-white/25"
                          >
                            {isUploadingAvatar ? "Uploading..." : "Upload photo"}
                          </label>
                          <input
                            id="avatar-file"
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            disabled={isUploadingAvatar || isRemovingAvatar}
                            onChange={handleAvatarFileChange}
                          />

                          <button
                            type="button"
                            disabled={!currentUser.user.hasAvatar || isRemovingAvatar || isUploadingAvatar}
                            onClick={handleRemoveAvatar}
                            className="surface-soft w-full px-3 py-2 text-sm font-medium text-[color:var(--text-muted)] transition hover:border-white/25 hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRemovingAvatar ? "Removing..." : "Remove photo"}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div className="surface-soft px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Signed in as</p>
                          <p className="mt-1 text-base font-medium text-[color:var(--text-primary)]">{displayName}</p>
                          <p className="mt-1 text-sm text-[color:var(--text-muted)]">{currentUser.user.email ?? "No email in token"}</p>
                        </div>

                        <form onSubmit={handleNameSubmit} className="space-y-3">
                          <label className="block text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]" htmlFor="display-name">
                            Display name
                          </label>
                          <input
                            id="display-name"
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            maxLength={80}
                            className="surface-soft w-full px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none"
                            placeholder="Your display name"
                          />

                          <button
                            type="submit"
                            disabled={isSavingName}
                            className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
                          >
                            {isSavingName ? "Saving..." : "Save profile"}
                          </button>
                        </form>

                        <div className="surface-soft px-4 py-3 text-sm text-[color:var(--text-muted)]">
                          <p>
                            Provider issuer: <span className="text-[color:var(--text-primary)]">{currentUser.principal.issuer}</span>
                          </p>
                          <p className="mt-1">
                            Roles: <span className="text-[color:var(--text-primary)]">{currentUser.principal.roles.join(", ") || "none"}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {statusMessage ? <p className="text-sm text-[color:var(--accent-primary-strong)]">{statusMessage}</p> : null}
                    {errorMessage ? <p className="text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
                  </>
                ) : (
                  <div className="surface-soft px-4 py-3 sm:px-5 sm:py-4">
                    <p className="text-sm font-medium text-[color:var(--text-primary)]">Sign in to manage account settings</p>
                    <p className="mt-1 text-xs text-[color:var(--text-dim)]">
                      Theme settings are available in General. Account profile controls require an authenticated session.
                    </p>
                    <Link
                      href="/login?returnTo=%2Fsettings"
                      className="mt-3 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-xs font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/14"
                    >
                      Go to login
                    </Link>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
