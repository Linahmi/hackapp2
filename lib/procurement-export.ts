import { getLatestSelectionForRequest, getRequestById, listApprovalsForSelection } from "@/db/queries";
import { summarizeRequest } from "@/lib/procurement-quotations";

export async function getProcurementWorkflowExport(requestId: string, userId: string) {
  const procurementRequest = await getRequestById(requestId);

  if (!procurementRequest) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (procurementRequest.userId && procurementRequest.userId !== userId) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const quotations = procurementRequest.campaigns
    .flatMap((campaign) =>
      campaign.quotations.map((row) => ({
        attachmentUrl: row.attachmentUrl,
        campaignId: row.rfqCampaignId,
        currency: row.currency,
        id: row.id,
        leadTimeDays: row.leadTimeDays,
        moq: row.moq,
        notes: row.notes,
        status: row.status,
        submittedAt: row.submittedAt,
        submittedBy: row.submittedBy,
        submittedRole: row.submittedRole,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name ?? "Unknown supplier",
        totalPrice: row.totalPrice,
        unitPrice: row.unitPrice,
      })),
    )
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  const selection = await getLatestSelectionForRequest(requestId);
  const selectedQuotation = selection
    ? quotations.find((quotation) => quotation.id === selection.quotationId) ?? null
    : null;
  const approvals = selection ? await listApprovalsForSelection(selection.id) : [];

  return {
    ok: true as const,
    approvals,
    auditEvents: procurementRequest.auditEvents,
    procurementRequest,
    quotations,
    requestSummary: summarizeRequest(procurementRequest.structuredData as Record<string, unknown> | null),
    selectedQuotation,
    selection,
  };
}
