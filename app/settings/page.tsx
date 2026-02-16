"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { type CurrentUserData, fetchCurrentUser, getDisplayName } from "@/app/lib/current-user";
import { ProfileAvatar } from "@/components/profile-avatar";

interface UserPayloadResponse {
  data?: {
    user: CurrentUserData["user"];
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCurrentUser() {
      try {
        const data = await fetchCurrentUser(controller.signal);

        if (!data) {
          router.replace("/login?returnTo=%2Fsettings");
          return;
        }

        setCurrentUser(data);
        setNameDraft(data.user.name ?? "");
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

      setCurrentUser((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          user: nextUser,
        };
      });
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

      setCurrentUser((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          user: nextUser,
        };
      });
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

      setCurrentUser((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          user: nextUser,
        };
      });
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
      router.replace("/login");
    }
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

  if (!currentUser) {
    return null;
  }

  const displayName = getDisplayName(currentUser.user.name, currentUser.user.email);

  return (
    <main className="relative min-h-screen p-4 sm:p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 mx-auto w-full max-w-3xl p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-dim)]">Account</p>
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">Settings</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            >
              Back to app
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-[var(--accent-secondary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-secondary-strong)] transition hover:bg-[var(--accent-secondary)]/15"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="mt-6 grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
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

        {statusMessage ? <p className="mt-5 text-sm text-[color:var(--accent-primary-strong)]">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
