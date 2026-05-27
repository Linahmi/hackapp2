import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  AUDIT_EVENT_TYPES,
  createSupplierSelection,
  getRequestById,
  logAuditEvent,
} from "@/db/queries";
import { db } from "@/db";
import { quotation } from "@/db/procurement-schema";

const bodySchema = z.object({
  quotationId: z.string().uuid("quotationId must be a valid UUID"),
  justification: z
    .string()
    .trim()
    .min(20, "Justification must be at least 20 characters")
    .max(4000),
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

  const selection = await createSupplierSelection({
    requestId,
    quotationId: parsed.data.quotationId,
    selectedBy: session.user.id,
    justification: parsed.data.justification,
  });

  // Mark the chosen quotation as SELECTED
  await db
    .update(quotation)
    .set({ status: "SELECTED" })
    .where(eq(quotation.id, parsed.data.quotationId));

  await logAuditEvent({
    requestId,
    type: AUDIT_EVENT_TYPES.SUPPLIER_SELECTED,
    message: `Supplier selected: ${quotationRow.supplier.name}`,
    metadata: {
      quotationId: parsed.data.quotationId,
      selectionId: selection.id,
      supplierId: quotationRow.supplierId,
      supplierName: quotationRow.supplier.name,
    },
  });

  return Response.json({ ok: true, selectionId: selection.id });
}
