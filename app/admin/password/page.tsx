"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, useMemo, useState } from "react";

interface ChangePasswordApiResponse {
  data?: {
    passwordUpdated: boolean;
    envFilePath: string;
  };
  error?: {
    message?: string;
  };
}

export default function AdminPasswordPage() {
  return (
    <Suspense fallback={<AdminPasswordFallback />}>
      <AdminPasswordContent />
    </Suspense>
  );
}

function AdminPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (nextPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation must match");
      setStatusMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/admin/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
        }),
      });

      const payload = (await response.json()) as ChangePasswordApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not change admin password");
      }

      setStatusMessage("Admin password updated.");
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.replace(returnTo);
      }, 250);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not change admin password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Change admin password
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Rotate the default admin password to continue with protected actions.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm text-[color:var(--text-primary)]" htmlFor="current-password">
            Current password
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm text-[color:var(--text-primary)]" htmlFor="new-password">
            New password
            <input
              id="new-password"
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm text-[color:var(--text-primary)]" htmlFor="confirm-password">
            Confirm new password
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting ? "Saving..." : "Update password"}
          </button>
        </form>

        {statusMessage ? <p className="mt-3 text-sm text-[color:var(--accent-primary-strong)]">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

function AdminPasswordFallback() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <p className="text-sm text-[color:var(--text-muted)]">Loading password form...</p>
      </section>
    </main>
  );
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/admin/dashboard";
  }

  return raw;
}
