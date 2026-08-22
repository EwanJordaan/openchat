import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Railway healthcheck hits this endpoint. Keep it lightweight & never throw.
export async function GET() {
  // Optional: quick DB ping if DATABASE_URL is set; don't fail healthcheck on DB error in bootstrap
  let db: "ok" | "unknown" | "error" = "unknown";
  try {
    const { pingDatabase } = await import("@/lib/db/client");
    // Only ping if env looks configured; timeout in 2s
    const controller = new AbortController();
    const tm = setTimeout(() => controller.abort(), 2000);
    void controller;
    await pingDatabase();
    clearTimeout(tm);
    db = "ok";
  } catch {
    db = "error";
  }

  // Optional: runner ping (private network) — don't fail healthcheck if runner not configured
  let runner: "ok" | "disabled" | "error" = "disabled";
  const runnerUrl = process.env.RUNNER_URL?.trim();
  if (runnerUrl) {
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 2000);
      const token = process.env.RUNNER_TOKEN?.trim();
      const res = await fetch(`${runnerUrl.replace(/\/$/, "")}/health`, {
        signal: controller.signal,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      clearTimeout(tm);
      runner = res.ok ? "ok" : "error";
    } catch {
      runner = "error";
    }
  }

  return NextResponse.json(
    {
      status: "ok",
      db,
      runner,
      timestamp: new Date().toISOString(),
      env: process.env.RAILWAY_ENVIRONMENT ? "railway" : process.env.NODE_ENV,
    },
    { status: 200 },
  );
}
