import { z } from "zod";
import { presignAttachmentUpload } from "@/lib/storage";

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const result = await presignAttachmentUpload(
    parsed.data.filename,
    parsed.data.contentType,
    parsed.data.sizeBytes,
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({ uploadUrl: result.uploadUrl, fileUrl: result.fileUrl });
}
