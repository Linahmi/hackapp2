import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  AUDIT_EVENT_TYPES,
  getActiveSupplierResponseTokenByHash,
  getQuotationByMessageId,
  getSupplierResponseTokenByHash,
  listQuotationsForRequest,
  logAuditEvent,
} from "@/db/queries";
import { db } from "@/db";
import {
  quotation,
  rfqMessage,
  supplierResponseToken,
} from "@/db/procurement-schema";
import { hashSupplierResponseToken } from "./procurement-response-tokens";

const quotationSubmissionSchema = z.object({
  attachmentUrl: z
    .string()
    .trim()
    .url("Attachment URL must be a valid URL")
    .optional()
    .or(z.literal("")),
  confirmationAccepted: z
    .boolean()
    .refine(
      (value) => value,
      "You must confirm that this quotation is accurate and valid for 30 days.",
    ),
  currency: z.string().trim().min(1, "Currency is required").max(16),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  moq: z.coerce.number().int().min(0).max(1000000000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  submittedBy: z.string().trim().min(1, "Submitted by is required").max(200),
  submittedRole: z.string().trim().max(200).optional().or(z.literal("")),
  token: z.string().trim().min(20, "Token is required"),
  totalPrice: z.coerce.number().positive("Total price is required"),
  unitPrice: z.coerce.number().positive("Unit price is required"),
});

export type QuotationSubmissionInput = z.infer<typeof quotationSubmissionSchema>;

type SupplierResponseValidationResult =
  | {
      reason: "expired" | "invalid" | "used";
      valid: false;
    }
  | {
      context: NonNullable<
        Awaited<ReturnType<typeof getActiveSupplierResponseTokenByHash>>
      >;
      valid: true;
    };

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalInteger(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function summarizeRequest(structuredData: Record<string, unknown> | null | undefined) {
  const request = structuredData as
    | {
        constraints?: string[];
        deliveryDate?: string;
        location?: string;
        quantity?: number;
        resourceType?: string;
        specifications?: string[];
      }
    | null
    | undefined;

  return {
    constraints: request?.constraints ?? [],
    deliveryDate: request?.deliveryDate ?? null,
    location: request?.location ?? null,
    quantity: request?.quantity ?? null,
    resourceType: request?.resourceType ?? null,
    specifications: request?.specifications ?? [],
  };
}

export async function validateSupplierResponseToken(
  rawToken: string,
): Promise<SupplierResponseValidationResult> {
  const tokenHash = hashSupplierResponseToken(rawToken);
  const validToken = await getActiveSupplierResponseTokenByHash(tokenHash);

  if (validToken) {
    return {
      context: validToken,
      valid: true,
    };
  }

  const anyToken = await getSupplierResponseTokenByHash(tokenHash);
  if (!anyToken) return { reason: "invalid", valid: false };
  if (anyToken.usedAt) return { reason: "used", valid: false };
  return { reason: "expired", valid: false };
}

export async function getSupplierResponsePageData(rawToken: string) {
  const validation = await validateSupplierResponseToken(rawToken);
  if (!validation.valid) return validation;

  const context = validation.context;
  const request = context.rfqMessage.campaign.request;
  const requestSummary = summarizeRequest(
    (request.structuredData as Record<string, unknown> | null | undefined) ?? null,
  );

  await logAuditEvent({
    requestId: request.id,
    campaignId: context.rfqMessage.campaignId,
    type: AUDIT_EVENT_TYPES.SUPPLIER_RESPONSE_PAGE_OPENED,
    message: `Supplier response page opened for ${context.rfqMessage.supplierEmail}`,
    metadata: {
      campaignId: context.rfqMessage.campaignId,
      rfqMessageId: context.rfqMessage.id,
      supplierId: context.rfqMessage.supplierId,
    },
  });

  return {
    context,
    request,
    requestSummary,
    valid: true as const,
  };
}

export async function submitSupplierQuotation(
  input: QuotationSubmissionInput,
  requestMeta: {
    ipAddress: string | null;
    userAgent: string | null;
  },
) {
  const parsed = quotationSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid quotation submission",
      issues: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join("."),
      })),
      ok: false as const,
      status: 400,
    };
  }

  const validation = await validateSupplierResponseToken(parsed.data.token);
  if (!validation.valid) {
    return {
      error:
        validation.reason === "used"
          ? "This response link has already been used."
          : validation.reason === "expired"
            ? "This response link has expired."
            : "This response link is invalid.",
      ok: false as const,
      status: 400,
    };
  }

  const context = validation.context;
  const existingQuotation = await getQuotationByMessageId(context.rfqMessage.id);
  if (existingQuotation) {
    return {
      error: "A quotation has already been submitted for this RFQ.",
      ok: false as const,
      status: 409,
    };
  }

  const submittedAt = new Date();
  const quotationRow = await db.transaction(async (tx) => {
    const [quotationRow] = await tx
      .insert(quotation)
      .values({
        attachmentUrl: normalizeOptionalText(parsed.data.attachmentUrl),
        confirmationAccepted: parsed.data.confirmationAccepted,
        currency: parsed.data.currency.trim().toUpperCase(),
        ipAddress: requestMeta.ipAddress,
        leadTimeDays: normalizeOptionalInteger(parsed.data.leadTimeDays ?? null),
        moq: normalizeOptionalInteger(parsed.data.moq ?? null),
        notes: normalizeOptionalText(parsed.data.notes),
        rfqCampaignId: context.rfqMessage.campaignId,
        rfqMessageId: context.rfqMessage.id,
        status: "SUBMITTED",
        submittedAt,
        submittedBy: parsed.data.submittedBy.trim(),
        submittedRole: normalizeOptionalText(parsed.data.submittedRole),
        supplierId: context.rfqMessage.supplierId,
        totalPrice: parsed.data.totalPrice.toFixed(2),
        unitPrice: parsed.data.unitPrice.toFixed(2),
        userAgent: requestMeta.userAgent,
      })
      .returning();

    if (!quotationRow) {
      throw new Error("Failed to create quotation");
    }

    const [usedToken] = await tx
      .update(supplierResponseToken)
      .set({ usedAt: submittedAt })
      .where(eq(supplierResponseToken.id, context.id))
      .returning();

    if (!usedToken) {
      throw new Error("Failed to mark supplier response token as used");
    }

    const [messageRow] = await tx
      .update(rfqMessage)
      .set({
        repliedAt: submittedAt,
        status: "REPLIED",
      })
      .where(eq(rfqMessage.id, context.rfqMessage.id))
      .returning();

    if (!messageRow) {
      throw new Error("Failed to update RFQ message status");
    }

    return quotationRow;
  });

  await Promise.all([
    logAuditEvent({
      requestId: context.rfqMessage.campaign.requestId,
      campaignId: context.rfqMessage.campaignId,
      type: AUDIT_EVENT_TYPES.QUOTATION_SUBMITTED,
      message: `Quotation submitted by ${context.rfqMessage.supplier.name}`,
      metadata: {
        campaignId: context.rfqMessage.campaignId,
        quotationId: quotationRow.id,
        rfqMessageId: context.rfqMessage.id,
        supplierId: context.rfqMessage.supplierId,
      },
    }),
    logAuditEvent({
      requestId: context.rfqMessage.campaign.requestId,
      campaignId: context.rfqMessage.campaignId,
      type: AUDIT_EVENT_TYPES.RFQ_MESSAGE_REPLIED,
      message: `Supplier replied to RFQ: ${context.rfqMessage.supplier.name}`,
      metadata: {
        campaignId: context.rfqMessage.campaignId,
        quotationId: quotationRow.id,
        rfqMessageId: context.rfqMessage.id,
        supplierId: context.rfqMessage.supplierId,
      },
    }),
  ]);

  return {
    ok: true as const,
    quotationId: quotationRow.id,
    requestId: context.rfqMessage.campaign.requestId,
  };
}

export async function getBuyerQuotations(requestId: string) {
  const rows = await listQuotationsForRequest(requestId);

  return rows.map((row) => ({
    campaignId: row.rfqCampaignId,
    currency: row.currency,
    id: row.id,
    leadTimeDays: row.leadTimeDays,
    moq: row.moq,
    notes: row.notes,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    submittedBy: row.submittedBy,
    submittedRole: row.submittedRole,
    supplierName: row.supplier.name,
    totalPrice: row.totalPrice,
    unitPrice: row.unitPrice,
  }));
}
