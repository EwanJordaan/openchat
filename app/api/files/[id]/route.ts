import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Legacy file endpoint removed. Use /api/docs/:id", code: "GONE" },
    { status: 410, headers: { "X-Deprecated": "use /api/docs/:id" } },
  );
}

export async function DELETE() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}

export const dynamic = "force-dynamic";
