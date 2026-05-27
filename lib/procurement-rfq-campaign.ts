import {
  AUDIT_EVENT_TYPES,
  addMessagesToCampaign,
  createCampaign,
  createSupplierResponseToken,
  deriveCampaignStatus,
  logAuditEvent,
  updateCampaignStatus,
  updateMessageStatus,
  updateRequestStatus,
} from "@/db/queries";
import { env } from "@/lib/env";
import { sendRfqEmail } from "@/lib/mailgun";
import { createSupplierResponseToken as createResponseToken } from "./procurement-response-tokens";

type CampaignMessageInput = {
  body: string;
  subject: string;
  supplierEmail: string;
  supplierId: string;
};

type BuyerContext = {
  buyerCompanyName?: string | null;
  buyerEmail?: string | null;
  buyerName?: string | null;
};

function buildResponseUrl(rawToken: string) {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;
  return `${baseUrl.replace(/\/$/, "")}/respond/${rawToken}`;
}

function buildEmailText(
  baseBody: string,
  responseUrl: string,
  buyer: BuyerContext,
) {
  const buyerSignature = buyer.buyerCompanyName || buyer.buyerName || "the buyer";

  return [
    baseBody,
    "",
    `To submit your quotation online, please use this secure link: ${responseUrl}`,
    "",
    "If the button or link does not work, please reply directly to this email.",
    "",
    `Sent on behalf of ${buyerSignature}.`,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailHtml(
  baseBody: string,
  responseUrl: string,
  buyer: BuyerContext,
) {
  const paragraphs = baseBody
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px; line-height:1.6; color:#1f2937;">${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("");

  const buyerSignature = buyer.buyerCompanyName || buyer.buyerName || "the buyer";

  return [
    `<div style="font-family:Arial,sans-serif; background:#f6f7f9; padding:32px;">`,
    `<div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:18px; padding:32px;">`,
    paragraphs,
    `<p style="margin:24px 0 12px; color:#374151;">Please submit your quotation using the secure response link below.</p>`,
    `<a href="${escapeHtml(responseUrl)}" style="display:inline-block; background:#14532d; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:999px; font-weight:600;">Submit quotation</a>`,
    `<p style="margin:18px 0 0; font-size:13px; color:#6b7280;">If the button does not work, open this link in your browser:<br /><a href="${escapeHtml(responseUrl)}" style="color:#14532d;">${escapeHtml(responseUrl)}</a></p>`,
    `<p style="margin:24px 0 0; font-size:13px; color:#6b7280;">Sent on behalf of ${escapeHtml(buyerSignature)}.</p>`,
    `</div>`,
    `</div>`,
  ].join("");
}

export async function sendProcurementRfqCampaign(input: {
  buyer: BuyerContext;
  messages: CampaignMessageInput[];
  requestId: string;
}) {
  const { buyer, messages, requestId } = input;

  const campaign = await createCampaign({ requestId });

  const dbMessages = await addMessagesToCampaign(
    messages.map((message) => ({
      body: message.body,
      campaignId: campaign.id,
      status: "PENDING" as const,
      subject: message.subject,
      supplierEmail: message.supplierEmail,
      supplierId: message.supplierId,
    })),
  );

  const messageIdBySupplierId = new Map(
    dbMessages.map((row) => [row.supplierId, row.id]),
  );

  await updateCampaignStatus(campaign.id, "SENDING", new Date());
  await updateRequestStatus(requestId, "SENT");

  await logAuditEvent({
    requestId,
    campaignId: campaign.id,
    type: AUDIT_EVENT_TYPES.CAMPAIGN_SENDING,
    message: `Sending RFQ campaign to ${messages.length} supplier${messages.length !== 1 ? "s" : ""}`,
    metadata: { messageCount: messages.length },
  });

  const sendResults = await Promise.all(
    messages.map(async (message) => {
      const dbMessageId = messageIdBySupplierId.get(message.supplierId);
      if (!dbMessageId) {
        return {
          error: "Missing RFQ message record",
          status: "FAILED" as const,
          supplierEmail: message.supplierEmail,
          supplierId: message.supplierId,
        };
      }

      const { expiresAt, rawToken, tokenHash } = createResponseToken();
      await createSupplierResponseToken({
        expiresAt,
        rfqMessageId: dbMessageId,
        tokenHash,
      });

      const responseUrl = buildResponseUrl(rawToken);

      await logAuditEvent({
        requestId,
        campaignId: campaign.id,
        type: AUDIT_EVENT_TYPES.SUPPLIER_RESPONSE_LINK_CREATED,
        message: `Supplier response link created for ${message.supplierEmail}`,
        metadata: {
          campaignId: campaign.id,
          expiresAt: expiresAt.toISOString(),
          rfqMessageId: dbMessageId,
          supplierId: message.supplierId,
        },
      });

      const result = await sendRfqEmail({
        html: buildEmailHtml(message.body, responseUrl, buyer),
        replyTo: buyer.buyerEmail ?? undefined,
        subject: message.subject,
        text: buildEmailText(message.body, responseUrl, buyer),
        to: message.supplierEmail,
      });

      if (result.ok) {
        await updateMessageStatus(dbMessageId, "QUEUED", {
          mailgunMessageId: result.mailgunMessageId,
          sentAt: new Date(),
        });

        await logAuditEvent({
          requestId,
          campaignId: campaign.id,
          type: AUDIT_EVENT_TYPES.MESSAGE_QUEUED,
          message: `RFQ queued for ${message.supplierEmail}`,
          metadata: {
            mailgunMessageId: result.mailgunMessageId,
            rfqMessageId: dbMessageId,
            supplierEmail: message.supplierEmail,
            supplierId: message.supplierId,
          },
        });

        return {
          mailgunMessageId: result.mailgunMessageId,
          status: "QUEUED" as const,
          supplierEmail: message.supplierEmail,
          supplierId: message.supplierId,
        };
      }

      await updateMessageStatus(dbMessageId, "FAILED", {
        errorMessage: result.error,
        failedAt: new Date(),
      });

      await logAuditEvent({
        requestId,
        campaignId: campaign.id,
        type: AUDIT_EVENT_TYPES.MESSAGE_FAILED,
        message: `Failed to send RFQ to ${message.supplierEmail}: ${result.error}`,
        metadata: {
          error: result.error,
          rfqMessageId: dbMessageId,
          supplierEmail: message.supplierEmail,
          supplierId: message.supplierId,
        },
      });

      return {
        error: result.error,
        status: "FAILED" as const,
        supplierEmail: message.supplierEmail,
        supplierId: message.supplierId,
      };
    }),
  );

  const finalStatus = await deriveCampaignStatus(campaign.id);
  await updateCampaignStatus(campaign.id, finalStatus);

  await logAuditEvent({
    requestId,
    campaignId: campaign.id,
    type:
      finalStatus === "SENT" || finalStatus === "PARTIALLY_SENT"
        ? AUDIT_EVENT_TYPES.CAMPAIGN_SENT
        : AUDIT_EVENT_TYPES.CAMPAIGN_FAILED,
    message: `Campaign status: ${finalStatus}`,
    metadata: {
      failed: sendResults.filter((result) => result.status === "FAILED").length,
      sent: sendResults.filter((result) => result.status === "QUEUED").length,
    },
  });

  return {
    campaignId: campaign.id,
    campaignStatus: finalStatus,
    results: sendResults,
  };
}
