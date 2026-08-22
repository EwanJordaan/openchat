import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

let cached: S3Client | null = null;

function isLocalEndpoint(endpoint: string) {
  return endpoint.includes("localhost") || endpoint.includes("127.0.0.1") || endpoint.includes("minio");
}

function hasS3Creds() {
  return Boolean(env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_BUCKET);
}

export function getS3Client(): S3Client {
  if (cached) return cached;
  const endpoint = env.S3_ENDPOINT;
  cached = new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint: endpoint || undefined,
    forcePathStyle: endpoint ? isLocalEndpoint(endpoint) : false,
    credentials:
      env.S3_ACCESS_KEY && env.S3_SECRET_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
        : undefined,
  });
  return cached;
}

function localPath(key: string) {
  return path.join(process.cwd(), ".uploads", key);
}

export async function presignUpload(opts: {
  key: string;
  mime: string;
  expiresSec?: number;
}): Promise<{ url: string; fields: Record<string, string> } | { presignedUrl: string }> {
  const expiresSec = opts.expiresSec ?? 3600;
  if (!hasS3Creds()) {
    const full = localPath(opts.key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    return { presignedUrl: `file://${full}` };
  }
  try {
    const client = getS3Client();
    const bucket = env.S3_BUCKET;
    const post = await createPresignedPost(client, {
      Bucket: bucket,
      Key: opts.key,
      Conditions: [
        ["content-length-range", 0, (env.MAX_UPLOAD_MB || 12) * 1024 * 1024],
        ["starts-with", "$Content-Type", ""],
      ],
      Fields: { "Content-Type": opts.mime || "application/octet-stream" },
      Expires: expiresSec,
    });
    return { url: post.url, fields: post.fields as Record<string, string> };
  } catch {
    const full = localPath(opts.key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    return { presignedUrl: `file://${full}` };
  }
}

export async function getObject(key: string): Promise<Buffer> {
  if (!hasS3Creds()) {
    const p = localPath(key);
    return fs.promises.readFile(p);
  }
  try {
    const client = getS3Client();
    const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const body = res.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> } & NodeJS.ReadableStream;
    if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
      const arr = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(arr);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body as unknown as AsyncIterable<Buffer | Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  } catch (e) {
    const p = localPath(key);
    if (fs.existsSync(p)) return fs.promises.readFile(p);
    throw e;
  }
}

export async function putObject(key: string, buffer: Buffer, mime: string): Promise<void> {
  if (!hasS3Creds()) {
    const p = localPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, buffer);
    return;
  }
  try {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: buffer, ContentType: mime }),
    );
  } catch {
    const p = localPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, buffer);
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!hasS3Creds()) {
    const p = localPath(key);
    await fs.promises.unlink(p).catch(() => undefined);
    return;
  }
  try {
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch {
    const p = localPath(key);
    await fs.promises.unlink(p).catch(() => undefined);
  }
}
