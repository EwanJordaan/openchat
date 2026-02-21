"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import {
  buildAuthStartUrl,
  buildProviderAuthStartUrl,
  fetchInteractiveAuthProviders,
  formatProviderNameLabel,
  isCredentialsProvider,
  isRedirectProvider,
  parseProviderName,
  type AuthProviderOption,
} from "@/app/lib/auth-providers";

interface LocalAuthApiResponse {
  data?: {
    authenticated?: boolean;
    redirectTo?: string;
  };
  error?: {
    message?: string;
  };
}

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
  const requestedProvider = useMemo(() => parseProviderName(searchParams.get("provider")), [searchParams]);

  const [providers, setProviders] = useState<AuthProviderOption[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadProviders() {
      try {
        const nextProviders = await fetchInteractiveAuthProviders(abortController.signal);
        setProviders(nextProviders);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not load authentication providers.");
      }
    }

    void loadProviders();

    return () => {
      abortController.abort();
    };
  }, []);

  const fallbackStartUrl = useMemo(
    () =>
      buildAuthStartUrl({
        mode: "register",
        returnTo,
        providerName: requestedProvider,
      }),
    [requestedProvider, returnTo],
  );

  const requestedProviderOption = useMemo(() => {
    if (!providers || !requestedProvider) {
      return null;
    }

    return providers.find((provider) => provider.name === requestedProvider) ?? null;
  }, [providers, requestedProvider]);

  const missingRequestedProvider = useMemo(() => {
    if (!providers || !requestedProvider) {
      return false;
    }

    return !requestedProviderOption;
  }, [providers, requestedProvider, requestedProviderOption]);

  const localProvider = useMemo(() => {
    if (!providers) {
      return null;
    }

    return providers.find((provider) => provider.name === "local" && isCredentialsProvider(provider)) ?? null;
  }, [providers]);

  const redirectProviders = useMemo(() => {
    if (!providers) {
      return [];
    }

    return providers.filter(isRedirectProvider);
  }, [providers]);

  const autoRedirectUrl = useMemo(() => {
    if (!providers || missingRequestedProvider) {
      return null;
    }

    if (requestedProviderOption) {
      if (isRedirectProvider(requestedProviderOption)) {
        return buildProviderAuthStartUrl(requestedProviderOption.name, "register", returnTo);
      }

      return null;
    }

    if (redirectProviders.length === 1 && !localProvider) {
      const [provider] = redirectProviders;
      if (!provider) {
        return null;
      }

      return buildProviderAuthStartUrl(provider.name, "register", returnTo);
    }

    return null;
  }, [localProvider, missingRequestedProvider, providers, redirectProviders, requestedProviderOption, returnTo]);

  useEffect(() => {
    if (!autoRedirectUrl) {
      return;
    }

    window.location.replace(autoRedirectUrl);
  }, [autoRedirectUrl]);

  const showLocalForm = Boolean(localProvider) && (!requestedProvider || requestedProvider === "local");

  async function handleLocalRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localProvider || isSubmittingLocal) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length === 0) {
      setLocalError("Enter your email and password.");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    setLocalError(null);
    setIsSubmittingLocal(true);

    try {
      const response = await fetch(localProvider.registerUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim() || undefined,
          returnTo,
        }),
      });

      const payload = (await response.json()) as LocalAuthApiResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not create a local account.");
      }

      const redirectTo = sanitizeReturnTo(payload.data?.redirectTo ?? returnTo);
      window.location.replace(redirectTo);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not create a local account.");
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="ambient-orb ambient-orb-a" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-b" aria-hidden="true" />

      <section className="surface relative z-10 w-full max-w-lg p-7 sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          {autoRedirectUrl ? "Redirecting to registration..." : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          {autoRedirectUrl
            ? "You are being redirected to your authentication provider."
            : "Choose how you want to register."}
        </p>

        {providers === null ? (
          <p className="mt-6 text-sm text-[color:var(--text-muted)]">Loading registration providers...</p>
        ) : errorMessage ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-[color:var(--accent-secondary-strong)]">{errorMessage}</p>
            <a
              href={fallbackStartUrl}
              className="inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
            >
              Continue
            </a>
          </div>
        ) : missingRequestedProvider && providers.length > 0 ? (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-[color:var(--accent-secondary-strong)]">Requested provider is not configured.</p>
            <p className="text-xs text-[color:var(--text-dim)]">Pick one of the available providers below.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {providers.map((provider) =>
                isCredentialsProvider(provider) ? (
                  <a
                    key={provider.name}
                    href={`/register?provider=local&returnTo=${encodeURIComponent(returnTo)}`}
                    className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
                  >
                    Continue with Local
                  </a>
                ) : (
                  <a
                    key={provider.name}
                    href={buildProviderAuthStartUrl(provider.name, "register", returnTo)}
                    className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
                  >
                    Continue with {formatProviderNameLabel(provider.name)}
                  </a>
                ),
              )}
            </div>
          </div>
        ) : providers.length === 0 ? (
          <p className="mt-6 text-sm text-[color:var(--accent-secondary-strong)]">
            No interactive auth providers are configured.
          </p>
        ) : autoRedirectUrl ? (
          <a
            href={autoRedirectUrl}
            className="mt-6 inline-flex rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
          >
            Continue
          </a>
        ) : (
          <div className="mt-6 space-y-4">
            {showLocalForm ? (
              <form className="space-y-3" onSubmit={handleLocalRegister}>
                <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="local-register-name">
                  <span>Name (optional)</span>
                  <input
                    id="local-register-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="local-register-email">
                  <span>Email</span>
                  <input
                    id="local-register-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="local-register-password">
                  <span>Password</span>
                  <input
                    id="local-register-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[color:var(--text-primary)]" htmlFor="local-register-confirm-password">
                  <span>Confirm password</span>
                  <input
                    id="local-register-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmittingLocal}
                  className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isSubmittingLocal ? "Creating account..." : "Create local account"}
                </button>

                {localError ? (
                  <p className="text-sm text-[color:var(--accent-secondary-strong)]">{localError}</p>
                ) : null}
              </form>
            ) : null}

            {redirectProviders.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {redirectProviders.map((provider) => (
                  <a
                    key={provider.name}
                    href={buildProviderAuthStartUrl(provider.name, "register", returnTo)}
                    className="rounded-lg border border-[var(--accent-primary)]/45 px-3 py-2 text-sm font-medium text-[color:var(--accent-primary-strong)] transition hover:bg-[var(--accent-primary)]/15"
                  >
                    Continue with {formatProviderNameLabel(provider.name)}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6">
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
