import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  AUDIT_EVENT_TYPES,
  advanceRequestStatus,
  createNotification,
  decideApproval,
  getApprovalById,
  logAuditEvent,
  resolveSelectionStatus,
} from "@/db/queries";
import { db } from "@/db";
import { supplierSelection } from "@/db/procurement-schema";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "decision must be APPROVED or REJECTED" },
      { status: 400 },
    );
  }

  const existing = await getApprovalById(id);
  if (!existing || existing.approverId !== session.user.id) {
    return Response.json({ error: "Approval not found" }, { status: 404 });
  }
  if (existing.decision !== "PENDING") {
    return Response.json({ error: "This approval has already been decided" }, { status: 409 });
  }

  await decideApproval(id, session.user.id, parsed.data.decision, parsed.data.comment ?? null);
  await resolveSelectionStatus(existing.selectionId);

  // Load the selection (after resolve) to check final status + get context for audit/notification
  const sel = await db.query.supplierSelection.findFirst({
    where: eq(supplierSelection.id, existing.selectionId),
    with: {
      request: { columns: { id: true, title: true, userId: true } },
      quotation: { with: { supplier: { columns: { name: true } } }, columns: { totalPrice: true, currency: true } },
    },
  });

  // Advance procurementRequest status when the selection is fully approved.
  // Rejection does NOT regress or advance the request status; selection-level state
  // captures it. The buyer sees the rejection via notification, re-selects, and the
  // new selection triggers a fresh SUPPLIER_SELECTED → APPROVED cycle.
  if (sel?.status === "APPROVED" && sel.requestId) {
    advanceRequestStatus(sel.requestId, "APPROVED", ["SUPPLIER_SELECTED"])
      .catch((err) => console.error("[status] Failed to advance request to APPROVED", err));
  }

  await logAuditEvent({
    requestId: sel?.requestId,
    type: AUDIT_EVENT_TYPES.APPROVAL_DECIDED,
    message: `Selection ${parsed.data.decision.toLowerCase()} by ${session.user.name ?? session.user.email}`,
    metadata: {
      approvalId: id,
      selectionId: existing.selectionId,
      decision: parsed.data.decision,
      approverId: session.user.id,
      comment: parsed.data.comment ?? null,
    },
  });

  // Notify the buyer of the decision
  if (sel?.request?.userId) {
    createNotification({
      userId: sel.request.userId,
      type: parsed.data.decision === "APPROVED" ? "SELECTION_APPROVED" : "SELECTION_REJECTED",
      payload: {
        selectionId: existing.selectionId,
        requestId: sel.requestId,
        requestTitle: sel.request.title,
        supplierName: sel.quotation?.supplier?.name ?? "Unknown",
        approverName: session.user.name ?? session.user.email ?? "An approver",
        comment: parsed.data.comment ?? null,
        decision: parsed.data.decision,
      },
    }).catch((err) => console.error("[notification] Failed to notify buyer of approval decision", err));
  }

  return Response.json({ ok: true, decision: parsed.data.decision });
}
