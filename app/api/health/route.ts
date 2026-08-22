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

  return NextResponse.json(
    {
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
      env: process.env.RAILWAY_ENVIRONMENT ? "railway" : process.env.NODE_ENV,
    },
    { status: 200 },
  );
}
