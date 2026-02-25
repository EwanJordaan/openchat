import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveActor } from "@/lib/auth/session";
import { getOwnedFiles } from "@/lib/db/store";
import { attachActorCookies, jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveActor();

  const files = await getOwnedFiles(resolved.actor, [id]);
  const file = files[0];
  if (!file) {
    return jsonError("File not found", 404);
  }

  try {
    const data = await fs.readFile(file.storagePath);
    const response = new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      },
    });
    return attachActorCookies(response, resolved);
  } catch {
    return jsonError("Stored file is missing", 410);
  }
}
