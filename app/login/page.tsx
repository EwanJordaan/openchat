"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AuthProviderView {
  name: string;
  loginUrl: string;
  registerUrl: string;
}

interface ProvidersResponse {
  data?: AuthProviderView[];
}

export default function LoginPage() {
  const [providers, setProviders] = useState<AuthProviderView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    const controller = new AbortController();
    setReturnTo(sanitizeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));

    async function loadProviders() {
      try {
        const response = await fetch("/api/v1/auth/providers", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setProviders([]);
          return;
        }

        const payload = (await response.json()) as ProvidersResponse;
        setProviders(Array.isArray(payload.data) ? payload.data : []);
      } catch {
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    }

    void loadProviders();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <div className="mb-6 flex items-center justify-between">
          <div className="brand-chip h-9 w-9">OC</div>
          <Link
            href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
            className="text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
          >
            Need an account?
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">Sign in</h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Continue with one of your configured identity providers.
        </p>

        <div className="mt-7 space-y-3">
          {isLoading ? (
            <p className="surface-soft px-4 py-3 text-sm text-[color:var(--text-muted)]">
              Loading providers...
            </p>
          ) : providers.length > 0 ? (
            providers.map((provider) => (
              <Link
                key={provider.name}
                href={`${provider.loginUrl}&returnTo=${encodeURIComponent(returnTo)}`}
                className="surface-soft block w-full px-4 py-3 text-left text-sm font-medium text-[color:var(--text-primary)] transition hover:border-white/25 hover:text-[color:var(--accent-primary-strong)]"
              >
                Continue with {provider.name}
              </Link>
            ))
          ) : (
            <p className="surface-soft px-4 py-3 text-sm text-[color:var(--text-muted)]">
              No interactive auth providers are configured. Add `oidc` settings under
              `BACKEND_AUTH_ISSUERS`.
            </p>
          )}
        </div>

        <p className="mt-6 text-xs text-[color:var(--text-dim)]">
          This flow uses secure HTTP-only cookie sessions after provider authentication.
        </p>
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
