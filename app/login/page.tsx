"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const startUrl = useMemo(
    () => `/api/v1/auth/start?mode=login&returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  );

  useEffect(() => {
    window.location.replace(startUrl);
  }, [startUrl]);

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Redirecting to sign in...
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          You are being signed in automatically with the configured default provider.
        </p>

        <a
          href={startUrl}
          className="mt-6 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
        >
          Continue
        </a>
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <p className="text-sm text-[color:var(--text-muted)]">Loading sign-in...</p>
      </section>
    </main>
  );
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
