"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, LogIn, UserPlus } from "lucide-react";

import type { Actor } from "@/lib/types";

const DEFAULT_NEXT_PATH = "/";

export function buildAuthPayload(mode: "login" | "register", email: string, password: string, name: string) {
  if (mode === "login") {
    return { email, password };
  }
  return { email, password, name };
}

export function SignInView({
  mode,
  nextPath,
}: {
  mode: "login" | "register";
  nextPath: string;
}) {
  const router = useRouter();
  const resolvedNextPath = nextPath || DEFAULT_NEXT_PATH;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json()) as { actor: Actor };
        if (!alive) return;
        if (data.actor.type === "user") {
          router.replace(resolvedNextPath);
          return;
        }
      } finally {
        if (alive) setCheckingSession(false);
      }
    };

    void check();
    return () => {
      alive = false;
    };
  }, [resolvedNextPath, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === "login" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    const payload = buildAuthPayload(mode, email, password, name);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
        message?: string;
      };
      if (!response.ok) {
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || data.message || "Authentication failed";
        setError(errorMessage);
        return;
      }

      router.replace(resolvedNextPath);
      router.refresh();
    } catch {
      setError("Network error while signing in");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="signin-shell">
        <div className="chat-loading">
          <LoaderCircle className="spin" size={26} />
          <p>Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div className="signin-header">
          <p className="eyebrow">OpenChat</p>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p>Sign in to save chats, manage settings, and use role-based limits.</p>
        </div>

        <form className="signin-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada Lovelace" required minLength={2} maxLength={80} />
            </label>
          ) : null}

          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              maxLength={128}
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <LoaderCircle size={14} className="spin" />
            ) : mode === "login" ? (
              <LogIn size={14} />
            ) : (
              <UserPlus size={14} />
            )}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="signin-backlink">
          {mode === "login" ? (
            <>
              New here? <Link href={`/signup?next=${encodeURIComponent(resolvedNextPath)}`}>Create account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href={`/signin?next=${encodeURIComponent(resolvedNextPath)}`}>Sign in</Link>
            </>
          )}
        </p>

        <p className="signin-backlink">
          Continue as guest? <Link href={resolvedNextPath}>Back to chat</Link>
        </p>
      </div>
    </div>
  );
}
