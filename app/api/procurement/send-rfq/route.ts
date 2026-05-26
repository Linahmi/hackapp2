/**
 * POST /api/procurement/send-rfq
 *
 * Creates an RFQ campaign, sends emails via Mailgun, and persists the full
 * lifecycle to the database.
 *
 * Request body:
 * {
 *   requestId: string          // DB UUID from procurementRequest
 *   messages: Array<{
 *     supplierId: string       // DB UUID from supplier table
 *     supplierEmail: string    // email to send to
 *     subject: string          // RFQ email subject
 *     body: string             // RFQ email body (plain text)
 *   }>
 * }
 *
 * Response:
 * {
 *   campaignId: string
 *   results: Array<{
 *     supplierId: string
 *     supplierEmail: string
 *     status: "QUEUED" | "FAILED"
 *     mailgunMessageId?: string
 *     error?: string
 *   }>
 * }
 */

import { z } from "zod";

import {
  AUDIT_EVENT_TYPES,
  addMessagesToCampaign,
  createCampaign,
  deriveCampaignStatus,
  logAuditEvent,
  updateCampaignStatus,
  updateMessageStatus,
  updateRequestStatus,
} from "@/db/queries";
import { auth } from "@/lib/auth";
import { sendRfqEmail } from "@/lib/mailgun";

// ─────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────

const messageSchema = z
  .object({
    supplierId: z.string().uuid("supplierId must be a valid UUID"),
    supplierEmail: z.string().email("supplierEmail must be a valid email"),
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(20000),
  })
  .strict();

const requestSchema = z
  .object({
    requestId: z.string().uuid("requestId must be a valid UUID"),
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required")
      .max(20, "Cannot send more than 20 messages per campaign"),
  })
  .strict();

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json(
      { error: "Authentication required to send RFQs" },
      { status: 401 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { requestId, messages } = parsed.data;

  // ── Create campaign ─────────────────────────────────────────────────────────
  let campaign: { id: string };
  try {
    campaign = await createCampaign({ requestId });
  } catch (err) {
    console.error("[send-rfq] Failed to create campaign", err);
    return Response.json(
      { error: "Failed to create RFQ campaign" },
      { status: 500 },
    );
  }

  // ── Insert message rows in PENDING state ────────────────────────────────────
  let dbMessages: Array<{ id: string; supplierId: string }>;
  try {
    dbMessages = await addMessagesToCampaign(
      messages.map((m) => ({
        campaignId: campaign.id,
        supplierId: m.supplierId,
        supplierEmail: m.supplierEmail,
        subject: m.subject,
        body: m.body,
        status: "PENDING" as const,
      })),
    );
  } catch (err) {
    console.error("[send-rfq] Failed to insert messages", err);
    return Response.json(
      { error: "Failed to create RFQ messages" },
      { status: 500 },
    );
  }

  // Build a map from supplierId → dbMessageId for status updates
  const messageIdBySupplierId = new Map(
    dbMessages.map((row) => [row.supplierId, row.id]),
  );

  // ── Update campaign to SENDING ──────────────────────────────────────────────
  await updateCampaignStatus(campaign.id, "SENDING", new Date());
  await updateRequestStatus(requestId, "SENT");

  await logAuditEvent({
    requestId,
    campaignId: campaign.id,
    type: AUDIT_EVENT_TYPES.CAMPAIGN_SENDING,
    message: `Sending RFQ campaign to ${messages.length} supplier${messages.length !== 1 ? "s" : ""}`,
    metadata: { messageCount: messages.length },
  });

  // ── Send via Mailgun ────────────────────────────────────────────────────────
  // Send all messages concurrently. Each result is independent — a failure on
  // one supplier email does not prevent the others from being sent.
  const sendResults = await Promise.all(
    messages.map(async (msg) => {
      const dbMessageId = messageIdBySupplierId.get(msg.supplierId);

      const result = await sendRfqEmail({
        to: msg.supplierEmail,
        subject: msg.subject,
        text: msg.body,
      });

      if (result.ok) {
        // Update to QUEUED with the Mailgun message ID for webhook correlation
        if (dbMessageId) {
          await updateMessageStatus(dbMessageId, "QUEUED", {
            mailgunMessageId: result.mailgunMessageId,
            sentAt: new Date(),
          });
        }

        await logAuditEvent({
          requestId,
          campaignId: campaign.id,
          type: AUDIT_EVENT_TYPES.MESSAGE_QUEUED,
          message: `RFQ queued for ${msg.supplierEmail}`,
          metadata: {
            mailgunMessageId: result.mailgunMessageId,
            supplierEmail: msg.supplierEmail,
          },
        });

        return {
          supplierId: msg.supplierId,
          supplierEmail: msg.supplierEmail,
          status: "QUEUED" as const,
          mailgunMessageId: result.mailgunMessageId,
        };
      } else {
        // Mark as FAILED in DB
        if (dbMessageId) {
          await updateMessageStatus(dbMessageId, "FAILED", {
            failedAt: new Date(),
            errorMessage: result.error,
          });
        }

        await logAuditEvent({
          requestId,
          campaignId: campaign.id,
          type: AUDIT_EVENT_TYPES.MESSAGE_FAILED,
          message: `Failed to send RFQ to ${msg.supplierEmail}: ${result.error}`,
          metadata: { supplierEmail: msg.supplierEmail, error: result.error },
        });

        return {
          supplierId: msg.supplierId,
          supplierEmail: msg.supplierEmail,
          status: "FAILED" as const,
          error: result.error,
        };
      }
    }),
  );

  // ── Derive and persist final campaign status ────────────────────────────────
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
      sent: sendResults.filter((r) => r.status === "QUEUED").length,
      failed: sendResults.filter((r) => r.status === "FAILED").length,
    },
  });

  return Response.json({
    campaignId: campaign.id,
    campaignStatus: finalStatus,
    results: sendResults,
  });
}
