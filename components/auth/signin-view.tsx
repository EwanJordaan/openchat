"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Actor } from "@/lib/types";

export function buildAuthPayload(mode: "login" | "register", email: string, password: string, name: string) {
  if (mode === "login") return { email, password };
  return { email, password, name };
}

export function SignInView({ mode, nextPath }: { mode: "login" | "register"; nextPath: string }) {
  const router = useRouter();
  const resolvedNext = nextPath || "/";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ actor: Actor }>)
      .then((j) => {
        if (!alive) return;
        if (j.actor?.type === "user") router.replace(resolvedNext);
      })
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [resolvedNext, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const endpoint = mode === "login" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    const payload = buildAuthPayload(mode, email, password, name);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string };
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : data.error?.message || data.message || "Authentication failed";
        setError(msg);
        return;
      }
      router.replace(resolvedNext);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="signin-shell">
        <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          <LoaderCircle className="spin" size={26} />
          <p>Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <div>
          <p className="eyebrow">OpenChat</p>
          <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.86rem", margin: "4px 0 0" }}>Sign in to save chats and use project workspaces.</p>
        </div>
        <form className="signin-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required minLength={2} maxLength={80} /></label>
          ) : null}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} maxLength={128} /></label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
          {mode === "login" ? (<>New here? <Link href={`/signup?next=${encodeURIComponent(resolvedNext)}`}>Create account</Link></>) : (<>Have account? <Link href={`/signin?next=${encodeURIComponent(resolvedNext)}`}>Sign in</Link></>)}
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Continue as guest? <Link href={resolvedNext}>Back</Link></p>
      </div>
    </div>
  );
}
