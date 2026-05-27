import { eq } from "drizzle-orm";

import { db } from "../index";
import { user } from "../schema";
import { approver, supplierSelection, type Approver } from "../procurement-schema";

export type { Approver };

export type ApproverWithUser = Approver & {
  approverUser: { id: string; name: string; email: string }
};

export async function listApproversForOwner(ownerId: string): Promise<ApproverWithUser[]> {
  const rows = await db.query.approver.findMany({
    where: eq(approver.ownerId, ownerId),
    with: { approverUser: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  // drizzle returns approverUser from the relation
  return rows as unknown as ApproverWithUser[];
}

export async function getUserByEmail(email: string) {
  return db.query.user.findFirst({ where: eq(user.email, email.toLowerCase().trim()) });
}

export async function createApprover(data: {
  ownerId: string;
  approverUserId: string;
  thresholdAmount?: string | null;
  thresholdCurrency?: string | null;
}): Promise<Approver> {
  const [row] = await db
    .insert(approver)
    .values({
      ownerId: data.ownerId,
      approverUserId: data.approverUserId,
      thresholdAmount: data.thresholdAmount ?? null,
      thresholdCurrency: data.thresholdCurrency?.toUpperCase() ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create approver");
  return row;
}

export async function deleteApprover(id: string, ownerId: string): Promise<void> {
  await db
    .delete(approver)
    .where(eq(approver.id, id));
  // ownerId guard handled at API level
  void ownerId;
}

/**
 * Returns approvers whose threshold is exceeded by this selection's total price.
 * Null threshold = always require approval.
 * Currency mismatch = always require approval (conservative).
 */
export async function getRequiredApprovers(
  ownerId: string,
  totalPrice: string,
  currency: string,
): Promise<ApproverWithUser[]> {
  const all = await listApproversForOwner(ownerId);
  const amount = Number(totalPrice);

  return all.filter((a) => {
    if (a.thresholdAmount === null || a.thresholdAmount === undefined) return true;
    // Currency mismatch → always require
    if (a.thresholdCurrency && a.thresholdCurrency.toUpperCase() !== currency.toUpperCase()) return true;
    return amount > Number(a.thresholdAmount);
  });
}

/**
 * Resolves the owner of a selection (the buyer who created the originating request).
 */
export async function getSelectionOwner(selectionId: string): Promise<string | null> {
  const sel = await db.query.supplierSelection.findFirst({
    where: eq(supplierSelection.id, selectionId),
    with: {
      request: { columns: { userId: true } },
    },
  });
  return sel?.request?.userId ?? null;
}
