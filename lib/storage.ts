/**
 * S3-compatible file storage — works with AWS S3 and Cloudflare R2.
 *
 * Required env vars:
 *   STORAGE_ACCESS_KEY_ID      — access key (R2: Account ID token)
 *   STORAGE_SECRET_ACCESS_KEY  — secret key
 *   STORAGE_BUCKET             — bucket name
 *   STORAGE_PUBLIC_URL         — public base URL (e.g. https://pub-xxx.r2.dev)
 *
 * Optional:
 *   STORAGE_ENDPOINT           — custom endpoint (R2: https://<accountId>.r2.cloudflarestorage.com)
 *   STORAGE_REGION             — AWS region or "auto" for R2 (default: "us-east-1")
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "./env";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function storageIsConfigured(): boolean {
  return !!(
    env.STORAGE_ACCESS_KEY_ID &&
    env.STORAGE_SECRET_ACCESS_KEY &&
    env.STORAGE_BUCKET &&
    env.STORAGE_PUBLIC_URL
  );
}

function buildClient(): S3Client {
  return new S3Client({
    region: env.STORAGE_REGION ?? "auto",
    endpoint: env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
    },
    // R2 requires path-style (not virtual-hosted-style)
    forcePathStyle: !!env.STORAGE_ENDPOINT,
  });
}

export type PresignResult =
  | { ok: true; uploadUrl: string; fileUrl: string; key: string }
  | { ok: false; error: string };

export type PresignDownloadResult =
  | { ok: true; downloadUrl: string }
  | { ok: false; error: string };

/**
 * Generate a presigned GET URL for a previously uploaded attachment.
 * Accepts the full public URL stored in the DB and derives the object key from it.
 * TTL is intentionally short (5 min) — these URLs are single-use download triggers.
 */
export async function presignAttachmentDownload(
  attachmentUrl: string,
): Promise<PresignDownloadResult> {
  if (!storageIsConfigured()) {
    return { ok: false, error: "File storage is not configured." };
  }

  const publicBase = env.STORAGE_PUBLIC_URL!.replace(/\/$/, "");
  if (!attachmentUrl.startsWith(publicBase + "/")) {
    return { ok: false, error: "Attachment URL does not match storage configuration." };
  }

  const key = attachmentUrl.slice(publicBase.length + 1);

  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET!,
    Key: key,
  });

  try {
    const client = buildClient();
    const downloadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 min
    return { ok: true, downloadUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate download URL",
    };
  }
}

/**
 * Generate a presigned PUT URL for a supplier attachment.
 * The browser uploads directly to S3/R2 — no file bytes pass through our server.
 */
export async function presignAttachmentUpload(
  originalFilename: string,
  contentType: string,
  sizeBytes: number,
): Promise<PresignResult> {
  if (!storageIsConfigured()) {
    return { ok: false, error: "File storage is not configured." };
  }

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return {
      ok: false,
      error: `Unsupported file type. Allowed: PDF, JPEG, PNG, WebP.`,
    };
  }

  if (sizeBytes > MAX_BYTES) {
    return {
      ok: false,
      error: `File too large. Maximum size is ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }

  const safeName = originalFilename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  // UUID prefix makes the key unguessable, but the bucket should still be private.
  // Buyer download access should eventually use presigned GET URLs, not public reads.
  const key = `quotations/${randomUUID()}/${safeName}`;

  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET!,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });

  try {
    const client = buildClient();
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 }); // 15 min
    const fileUrl = `${env.STORAGE_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
    return { ok: true, uploadUrl, fileUrl, key };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate upload URL",
    };
  }
}
