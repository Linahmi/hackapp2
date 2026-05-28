import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  AUDIT_EVENT_TYPES,
  advanceRequestStatus,
  createNotification,
  getActiveSupplierResponseTokenByHash,
  getCompanySettings,
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
import { sendRfqEmail } from "@/lib/mailgun";
import { env } from "@/lib/env";
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
  const [quotationRows, usedTokens, messageRows] = await db.batch([
    db
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
      .returning(),
    db
      .update(supplierResponseToken)
      .set({ usedAt: submittedAt })
      .where(eq(supplierResponseToken.id, context.id))
      .returning(),
    db
      .update(rfqMessage)
      .set({
        repliedAt: submittedAt,
        status: "REPLIED",
      })
      .where(eq(rfqMessage.id, context.rfqMessage.id))
      .returning(),
  ]);

  const [quotationRow] = quotationRows;
  if (!quotationRow) {
    throw new Error("Failed to create quotation");
  }

  const [usedToken] = usedTokens;
  if (!usedToken) {
    throw new Error("Failed to mark supplier response token as used");
  }

  const [messageRow] = messageRows;
  if (!messageRow) {
    throw new Error("Failed to update RFQ message status");
  }

  const buyerUserId = context.rfqMessage.campaign.request.userId;

  await Promise.all([
    // Advance request status to QUOTES_RECEIVED on the first quotation
    advanceRequestStatus(
      context.rfqMessage.campaign.requestId,
      "QUOTES_RECEIVED",
      ["DRAFT", "SEARCHING", "MATCHED", "READY", "SENT", "RFQ_SENT"],
    ).catch((err) => console.error("[status] Failed to advance to QUOTES_RECEIVED", err)),

    // Notify the request creator (request.userId) that a supplier replied.
    // Scoped to the individual who created the request, not the whole company.
    // When multi-user companies are added, extend this to notify all company members.
    buyerUserId
      ? createNotification({
          userId: buyerUserId,
          type: "QUOTATION_RECEIVED",
          payload: {
            supplierName: context.rfqMessage.supplier.name,
            requestTitle: context.rfqMessage.campaign.request.title,
            requestId: context.rfqMessage.campaign.requestId,
            quotationId: quotationRow.id,
            totalPrice: parsed.data.totalPrice.toFixed(2),
            currency: parsed.data.currency.trim().toUpperCase(),
          },
        }).catch((err) => console.error("[notification] Failed to create notification", err))
      : Promise.resolve(),
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
    // Fire-and-forget — never let a confirmation email failure break the submission
    sendSupplierConfirmationEmail({
      buyerUserId: context.rfqMessage.campaign.request.userId,
      currency: parsed.data.currency.trim().toUpperCase(),
      leadTimeDays: normalizeOptionalInteger(parsed.data.leadTimeDays ?? null),
      moq: normalizeOptionalInteger(parsed.data.moq ?? null),
      notes: normalizeOptionalText(parsed.data.notes),
      requestTitle: context.rfqMessage.campaign.request.title,
      submittedBy: parsed.data.submittedBy.trim(),
      submittedRole: normalizeOptionalText(parsed.data.submittedRole),
      supplierEmail: context.rfqMessage.supplierEmail,
      totalPrice: parsed.data.totalPrice.toFixed(2),
      unitPrice: parsed.data.unitPrice.toFixed(2),
    }).catch((err) => console.error("[confirm-email] Failed to send supplier confirmation", err)),
  ]);

  return {
    ok: true as const,
    quotationId: quotationRow.id,
    requestId: context.rfqMessage.campaign.requestId,
  };
}

function formatPrice(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

async function sendSupplierConfirmationEmail(params: {
  buyerUserId: string | null | undefined;
  requestTitle: string;
  submittedBy: string;
  submittedRole: string | null;
  supplierEmail: string;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  leadTimeDays: number | null;
  moq: number | null;
  notes: string | null;
}) {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) return;

  const settings = params.buyerUserId
    ? await getCompanySettings(params.buyerUserId).catch(() => null)
    : null;

  const buyerName = settings?.companyName ?? "the buyer";
  const fromDomain = env.MAILGUN_DOMAIN;
  const fromName = [settings?.senderName, settings?.companyName].filter(Boolean).join(" — ") || "Procora";
  const fromAddress = fromDomain ? `noreply@${fromDomain}` : undefined;
  const from = fromAddress ? `${fromName} <${fromAddress}>` : undefined;
  const replyTo = settings?.senderEmail ?? undefined;

  const subject = `Your quotation has been received — ${params.requestTitle}`;

  const rows = [
    ["Unit price", formatPrice(params.unitPrice, params.currency)],
    ["Total price", formatPrice(params.totalPrice, params.currency)],
    ["Lead time", params.leadTimeDays != null ? `${params.leadTimeDays} day${params.leadTimeDays !== 1 ? "s" : ""}` : "—"],
    ["MOQ", params.moq != null ? String(params.moq) : "—"],
    ["Notes", params.notes ?? "—"],
  ];

  const textRows = rows.map(([label, val]) => `  ${label}: ${val}`).join("\n");
  const htmlRows = rows
    .map(([label, val]) => `<tr><td style="padding:6px 12px 6px 0; color:#6b7280; font-size:13px; white-space:nowrap;">${label}</td><td style="padding:6px 0; color:#111827; font-size:13px;">${val}</td></tr>`)
    .join("");

  const text = [
    `Dear ${params.submittedBy}${params.submittedRole ? ` (${params.submittedRole})` : ""},`,
    "",
    `Thank you — your quotation for "${params.requestTitle}" has been successfully received by ${buyerName}.`,
    "",
    "Here is a summary of what you submitted:",
    textRows,
    "",
    `${buyerName} will review your offer and get back to you if they have questions.`,
    "",
    "Best regards,",
    `Procora — on behalf of ${buyerName}`,
  ].join("\n");

  const html = [
    `<div style="font-family:Arial,sans-serif; background:#f6f7f9; padding:32px;">`,
    `<div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:18px; padding:32px;">`,
    `<p style="margin:0 0 8px; font-size:13px; color:#6b7280; font-family:monospace; text-transform:uppercase; letter-spacing:0.08em;">Quotation received</p>`,
    `<h1 style="margin:0 0 24px; font-size:20px; font-weight:700; color:#111827; line-height:1.3;">${params.requestTitle}</h1>`,
    `<p style="margin:0 0 20px; font-size:15px; color:#374151; line-height:1.6;">Dear <strong>${params.submittedBy}</strong>${params.submittedRole ? ` <span style="color:#6b7280;">(${params.submittedRole})</span>` : ""},</p>`,
    `<p style="margin:0 0 24px; font-size:15px; color:#374151; line-height:1.6;">Your quotation has been successfully received by <strong>${buyerName}</strong>. Here is what we recorded:</p>`,
    `<table style="width:100%; border-collapse:collapse; margin-bottom:24px;">${htmlRows}</table>`,
    `<p style="margin:0 0 0; font-size:14px; color:#6b7280; line-height:1.6;">${buyerName} will review your offer and contact you if they have questions.</p>`,
    `<hr style="margin:28px 0; border:none; border-top:1px solid #e5e7eb;" />`,
    `<p style="margin:0; font-size:12px; color:#9ca3af;">Sent by Procora on behalf of ${buyerName}.</p>`,
    `</div></div>`,
  ].join("");

  await sendRfqEmail({ from, html, replyTo, subject, text, to: params.supplierEmail });
}

export async function getBuyerQuotations(requestId: string) {
  const rows = await listQuotationsForRequest(requestId);

  return rows.map((row) => ({
    attachmentUrl: row.attachmentUrl,
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
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    totalPrice: row.totalPrice,
    unitPrice: row.unitPrice,
  }));
}
