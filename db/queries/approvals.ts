import { and, eq, ne } from "drizzle-orm";

import { db } from "../index";
import {
  approval,
  supplierSelection,
  type Approval,
  type ApprovalDecision,
} from "../procurement-schema";

export type { Approval, ApprovalDecision };

export type ApprovalWithContext = Approval & {
  selection: {
    id: string;
    justification: string;
    status: string;
    requestId: string;
    quotationId: string;
    selectedAt: Date;
    request?: { id: string; title: string } | null;
    quotation?: {
      totalPrice: string;
      currency: string;
      supplier?: { name: string } | null;
    } | null;
  };
};

export async function createApprovals(
  selectionId: string,
  approverUserIds: string[],
): Promise<Approval[]> {
  if (approverUserIds.length === 0) return [];
  const rows = await db
    .insert(approval)
    .values(approverUserIds.map((approverId) => ({ selectionId, approverId })))
    .returning();
  return rows;
}

export async function listPendingApprovalsForApprover(
  approverId: string,
): Promise<ApprovalWithContext[]> {
  const rows = await db.query.approval.findMany({
    where: and(eq(approval.approverId, approverId), eq(approval.decision, "PENDING")),
    orderBy: (t, { desc }) => desc(t.createdAt),
    with: {
      selection: {
        with: {
          request: { columns: { id: true, title: true } },
          quotation: {
            with: { supplier: { columns: { name: true } } },
            columns: { totalPrice: true, currency: true },
          },
        },
      },
    },
  });
  return rows as unknown as ApprovalWithContext[];
}

export async function getApprovalById(id: string): Promise<Approval | null> {
  const row = await db.query.approval.findFirst({ where: eq(approval.id, id) });
  return row ?? null;
}

export async function decideApproval(
  id: string,
  approverId: string,
  decision: Exclude<ApprovalDecision, "PENDING">,
  comment: string | null,
): Promise<Approval> {
  const [row] = await db
    .update(approval)
    .set({ decision, comment, decidedAt: new Date() })
    .where(and(eq(approval.id, id), eq(approval.approverId, approverId)))
    .returning();
  if (!row) throw new Error("Approval not found or not authorized");
  return row;
}

/**
 * After an approver decides, check if the selection should be resolved.
 * - Any REJECTED → selection = REJECTED
 * - All APPROVED  → selection = APPROVED
 * - Else          → still PENDING_APPROVAL
 */
export async function resolveSelectionStatus(selectionId: string): Promise<void> {
  const all = await db.query.approval.findMany({
    where: eq(approval.selectionId, selectionId),
  });

  if (all.some((a) => a.decision === "REJECTED")) {
    await db
      .update(supplierSelection)
      .set({ status: "REJECTED" })
      .where(eq(supplierSelection.id, selectionId));
    return;
  }

  if (all.every((a) => a.decision === "APPROVED")) {
    await db
      .update(supplierSelection)
      .set({ status: "APPROVED" })
      .where(eq(supplierSelection.id, selectionId));
  }
}

export async function countPendingApprovalsForApprover(approverId: string): Promise<number> {
  const rows = await db.query.approval.findMany({
    where: and(eq(approval.approverId, approverId), eq(approval.decision, "PENDING")),
    columns: { id: true },
  });
  return rows.length;
}
