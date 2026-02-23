import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { resolveActor } from "@/lib/auth/session";
import { createFileRecord } from "@/lib/db/store";
import { env } from "@/lib/env";
import { attachActorCookies, jsonError } from "@/lib/http";
import { createId } from "@/lib/utils";

export const runtime = "nodejs";

const ALLOWED_MIME_PREFIXES = ["text/", "image/", "application/pdf", "application/json"];

function isAllowedMimeType(mimeType: string) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export async function POST(request: Request) {
  const resolved = await resolveActor();
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (!files.length) {
    return jsonError("No files were included in the upload", 400);
  }

  const uploadRoot = path.join(process.cwd(), ".uploads");
  await fs.mkdir(uploadRoot, { recursive: true });

  const uploaded = [] as Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;

  for (const file of files) {
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return jsonError(`File ${file.name} exceeds ${env.MAX_UPLOAD_MB}MB`, 400);
    }

    const mimeType = file.type || "application/octet-stream";
    if (!isAllowedMimeType(mimeType)) {
      return jsonError(`File type not allowed: ${mimeType}`, 400);
    }

    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const storageName = `${createId("upl")}${extension}`;
    const storagePath = path.join(uploadRoot, storageName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(storagePath, buffer);

    const fileId = await createFileRecord({
      ownerUserId: resolved.actor.type === "user" ? resolved.actor.userId : null,
      guestId: resolved.actor.guestId,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      storagePath,
    });

    uploaded.push({
      id: fileId,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    });
  }

  const response = NextResponse.json({ files: uploaded });
  return attachActorCookies(response, resolved);
}
