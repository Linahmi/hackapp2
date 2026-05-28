import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  AUDIT_EVENT_TYPES,
  advanceRequestStatus,
  createApprovals,
  createNotification,
  getCompanySettings,
  getRequestById,
  getRequiredApprovers,
  logAuditEvent,
} from "@/db/queries";
import { db } from "@/db";
import { quotation, rfqCampaign, supplierSelection } from "@/db/procurement-schema";
import { buildMailgunSender, sendRfqEmail } from "@/lib/mailgun";
import { env } from "@/lib/env";

const bodySchema = z.object({
  quotationId: z.string().uuid({ error: "quotationId must be a valid UUID" }),
  justification: z
    .string()
    .trim()
    .min(20, "Justification must be at least 20 characters")
    .max(4000),
  // force=true allows replacing an existing selection (UI shows a confirmation first)
  force: z.boolean().optional().default(false),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { requestId } = await context.params;

  const procurementRequest = await getRequestById(requestId);
  if (!procurementRequest) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }
  if (procurementRequest.userId && procurementRequest.userId !== session.user.id) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request body",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  // Verify the quotation belongs to this request
  const quotationRow = await db.query.quotation.findFirst({
    where: eq(quotation.id, parsed.data.quotationId),
    with: { campaign: true, supplier: true },
  });
  if (!quotationRow || quotationRow.campaign.requestId !== requestId) {
    return Response.json({ error: "Quotation not found for this request" }, { status: 404 });
  }

  const existing = await db.query.supplierSelection.findFirst({
    where: and(
      eq(supplierSelection.requestId, requestId),
      ne(supplierSelection.status, "REJECTED"),
    ),
    with: { quotation: { with: { supplier: true } } },
  });

  if (existing && !parsed.data.force) {
    return Response.json(
      {
        error: "A supplier has already been selected for this request",
        conflict: {
          selectionId: existing.id,
          supplierName: existing.quotation?.supplier?.name ?? "Unknown",
          selectedAt: existing.selectedAt,
          justification: existing.justification,
        },
      },
      { status: 409 },
    );
  }

  if (existing) {
    await db.batch([
      db
        .update(supplierSelection)
        .set({ status: "REJECTED" })
        .where(eq(supplierSelection.id, existing.id)),
      db
        .update(quotation)
        .set({ status: "SUBMITTED" })
        .where(eq(quotation.id, existing.quotationId)),
    ]);
  }

  const [newSelection] = await db
    .insert(supplierSelection)
    .values({
      requestId,
      quotationId: parsed.data.quotationId,
      selectedBy: session.user.id,
      justification: parsed.data.justification,
    })
    .returning();

  if (!newSelection) throw new Error("Failed to create selection");

  const campaigns = await db.query.rfqCampaign.findMany({
    where: eq(rfqCampaign.requestId, requestId),
    with: { quotations: { columns: { id: true } } },
  });
  const otherIds = campaigns
    .flatMap((c) => c.quotations.map((q) => q.id))
    .filter((id) => id !== parsed.data.quotationId);

  const selectedQuotationUpdate = db
    .update(quotation)
    .set({ status: "SELECTED" })
    .where(eq(quotation.id, parsed.data.quotationId));

  if (otherIds.length === 0) {
    await selectedQuotationUpdate;
  } else {
    await db.batch([
      selectedQuotationUpdate,
      db
        .update(quotation)
        .set({ status: "NOT_SELECTED" })
        .where(inArray(quotation.id, otherIds)),
    ]);
  }
  const selectionId = newSelection.id;

  await logAuditEvent({
    requestId,
    type: AUDIT_EVENT_TYPES.SUPPLIER_SELECTED,
    message: `Supplier selected: ${quotationRow.supplier.name}`,
    metadata: {
      quotationId: parsed.data.quotationId,
      selectionId,
      supplierId: quotationRow.supplierId,
      supplierName: quotationRow.supplier.name,
      superseded: parsed.data.force,
    },
  });

  await advanceRequestStatus(requestId, "SUPPLIER_SELECTED", [
    "DRAFT", "SEARCHING", "MATCHED", "READY", "SENT", "RFQ_SENT", "QUOTES_RECEIVED", "UNDER_REVIEW",
  ]).catch((err) => console.error("[status] Failed to advance to SUPPLIER_SELECTED", err));

  const requiredApprovers = await getRequiredApprovers(
    session.user.id,
    quotationRow.totalPrice,
    quotationRow.currency,
  );

  if (requiredApprovers.length === 0) {
    await db
      .update(supplierSelection)
      .set({ status: "APPROVED" })
      .where(eq(supplierSelection.id, selectionId));

    await logAuditEvent({
      requestId,
      type: AUDIT_EVENT_TYPES.SELECTION_AUTO_APPROVED,
      message: "Selection auto-approved (no approval threshold exceeded)",
      metadata: { selectionId },
    });

    await advanceRequestStatus(requestId, "APPROVED", ["SUPPLIER_SELECTED"])
      .catch((err) => console.error("[status] Failed to advance to APPROVED", err));

    return Response.json({ ok: true, selectionId, requiresApproval: false });
  }

  await createApprovals(selectionId, requiredApprovers.map((a) => a.approverUserId));

  const companySettings = await getCompanySettings(session.user.id).catch(() => null);
  const buyerName = session.user.name ?? session.user.email ?? "A buyer";
  const fromName = [companySettings?.senderName, companySettings?.companyName]
    .filter(Boolean)
    .join(" — ") || buyerName;
  const emailFrom = buildMailgunSender(fromName);
  const approvalsUrl = `${(env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL).replace(/\/$/, "")}/approvals`;

  await Promise.all(
    requiredApprovers.flatMap((a) => [
      createNotification({
        userId: a.approverUserId,
        type: "APPROVAL_REQUESTED",
        payload: {
          selectionId,
          requestId,
          requestTitle: procurementRequest.title,
          supplierName: quotationRow.supplier.name,
          totalPrice: quotationRow.totalPrice,
          currency: quotationRow.currency,
          submittedBy: buyerName,
        },
      }).catch((err) => console.error("[notification] Failed to notify approver", err)),

      sendRfqEmail({
        from: emailFrom,
        replyTo: companySettings?.senderEmail ?? undefined,
        to: a.approverUser.email,
        subject: `Approval requested - ${quotationRow.supplier.name} (${Number(quotationRow.totalPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quotationRow.currency})`,
        text: [
          `Hi ${a.approverUser.name},`,
          ``,
          `${buyerName} has selected ${quotationRow.supplier.name} for "${procurementRequest.title}" and requires your approval.`,
          ``,
          `Amount: ${Number(quotationRow.totalPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quotationRow.currency}`,
          ``,
          `Review and approve or reject this selection at:`,
          approvalsUrl,
          ``,
          `- ${fromName}`,
        ].join("\n"),
      }).then((result) => {
        if (!result.ok) console.error("[email] Failed to email approver:", result.error);
      }).catch((err) => console.error("[email] Failed to email approver", err)),
    ]),
  );

  await logAuditEvent({
    requestId,
    type: AUDIT_EVENT_TYPES.SELECTION_SUBMITTED_FOR_APPROVAL,
    message: `Selection submitted for approval to ${requiredApprovers.length} approver${requiredApprovers.length !== 1 ? "s" : ""}`,
    metadata: {
      selectionId,
      approverCount: requiredApprovers.length,
      approverIds: requiredApprovers.map((a) => a.approverUserId),
    },
  });

  return Response.json({ ok: true, selectionId, requiresApproval: true, approverCount: requiredApprovers.length });
}
