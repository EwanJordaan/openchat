"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const startUrl = useMemo(
    () => `/api/v1/auth/start?mode=register&returnTo=${encodeURIComponent(returnTo)}`,
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
          Redirecting to registration...
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          You are being redirected to the configured default provider.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href={startUrl}
            className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
          >
            Continue
          </a>
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
          >
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}

function RegisterFallback() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />
      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <p className="text-sm text-[color:var(--text-muted)]">Loading registration...</p>
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
