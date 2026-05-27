import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
  quotation,
  supplierSelection,
  type NewSupplierSelection,
  type SupplierSelection,
} from "../procurement-schema";

export type { SupplierSelection };

export async function createSupplierSelection(
  data: Pick<NewSupplierSelection, "requestId" | "quotationId" | "selectedBy" | "justification">,
): Promise<SupplierSelection> {
  const [row] = await db
    .insert(supplierSelection)
    .values({
      requestId: data.requestId,
      quotationId: data.quotationId,
      selectedBy: data.selectedBy,
      justification: data.justification,
    })
    .returning();
  if (!row) throw new Error("Failed to create supplier selection");
  return row;
}

export async function getLatestSelectionForRequest(
  requestId: string,
): Promise<(SupplierSelection & { quotation: typeof quotation.$inferSelect | null }) | null> {
  const row = await db.query.supplierSelection.findFirst({
    where: eq(supplierSelection.requestId, requestId),
    orderBy: [desc(supplierSelection.selectedAt)],
    with: { quotation: true },
  });
  return row ?? null;
}
