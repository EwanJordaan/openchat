"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, useMemo, useState } from "react";

interface LocalAdminLoginResponse {
  data?: {
    authenticated: boolean;
    username: string;
    mustChangePassword: boolean;
    returnTo: string;
  };
  error?: {
    message?: string;
  };
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginFallback />}>
      <AdminLoginContent />
    </Suspense>
  );
}

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/admin/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password,
          returnTo,
        }),
      });

      const payload = (await response.json()) as LocalAdminLoginResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Invalid username or password");
      }

      if (payload.data.mustChangePassword) {
        router.replace(`/admin/password?returnTo=${encodeURIComponent(payload.data.returnTo)}`);
        return;
      }

      router.replace(payload.data.returnTo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed");
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
          Admin password sign in
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          This is a separate local admin account. It does not use your app user login.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm text-[color:var(--text-primary)]" htmlFor="admin-password">
            Password
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
              autoComplete="current-password"
              placeholder="admin"
              disabled={isSubmitting}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {errorMessage ? <p className="mt-3 text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

function AdminLoginFallback() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <p className="text-sm text-[color:var(--text-muted)]">Loading admin login...</p>
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
