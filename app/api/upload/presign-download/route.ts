import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { approval, quotation, supplierSelection } from "@/db/procurement-schema";
import { presignAttachmentDownload, storageIsConfigured } from "@/lib/storage";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const attachmentUrl = searchParams.get("url");

  if (!attachmentUrl) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Step 1: look up the quotation so we know which request it belongs to.
  // Also blocks using this endpoint as a generic S3 proxy (404 for unknown URLs).
  const row = await db.query.quotation.findFirst({
    where: eq(quotation.attachmentUrl, attachmentUrl),
    with: {
      campaign: {
        with: { request: true },
      },
    },
  });

  if (!row) {
    return Response.json({ error: "Attachment not found" }, { status: 404 });
  }

  const requestId = row.campaign.request.id;
  const userId = session.user.id;

  // Step 2: authorize — allow (a) the request owner or (b) any active approver
  // on a selection tied to this request. Approvers need attachment access to make
  // informed approval decisions.
  const isOwner = row.campaign.request.userId === userId;

  let isApprover = false;
  if (!isOwner) {
    const selectionIds = (
      await db
        .select({ id: supplierSelection.id })
        .from(supplierSelection)
        .where(eq(supplierSelection.requestId, requestId))
    ).map((s) => s.id);

    if (selectionIds.length > 0) {
      const approverRow = await db.query.approval.findFirst({
        where: and(
          eq(approval.approverId, userId),
          inArray(approval.selectionId, selectionIds),
        ),
        columns: { id: true },
      });
      isApprover = !!approverRow;
    }
  }

  if (!isOwner && !isApprover) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // When storage is not configured (dev without env vars), return the URL unchanged.
  if (!storageIsConfigured()) {
    return Response.json({ downloadUrl: attachmentUrl });
  }

  const result = await presignAttachmentDownload(attachmentUrl);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({ downloadUrl: result.downloadUrl });
}
