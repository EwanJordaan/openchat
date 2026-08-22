import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy file upload removed. Use POST /api/docs/presign + /api/docs/upload-complete", code: "GONE" },
    { status: 410, headers: { "X-Deprecated": "use /api/docs/*" } },
  );
}

export async function GET() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}

export const dynamic = "force-dynamic";
