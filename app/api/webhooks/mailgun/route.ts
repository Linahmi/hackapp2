/**
 * POST /api/webhooks/mailgun
 *
 * Receives Mailgun delivery-event webhooks and updates the corresponding
 * RFQ message and campaign status in the database.
 *
 * Mailgun webhooks reference:
 * https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/
 *
 * Signature verification uses HMAC-SHA256 with the Mailgun webhook signing key
 * (Settings → Webhooks in the Mailgun dashboard). Set MAILGUN_WEBHOOK_SIGNING_KEY
 * in your environment. Without it, verification is skipped with a warning.
 *
 * Event → MessageStatus mapping:
 *   delivered   → DELIVERED  (deliveredAt)
 *   opened      → OPENED     (openedAt)
 *   failed      → FAILED     (failedAt + errorMessage)
 *   complained  → BOUNCED    (failedAt + "Spam complaint received")
 *   clicked / unsubscribed / stored → audit-only, no status change
 */

import {
  AUDIT_EVENT_TYPES,
  deriveCampaignStatus,
  getMessageByMailgunId,
  logAuditEvent,
  updateCampaignStatus,
  updateMessageStatus,
} from "@/db/queries";
import type { MessageStatus } from "@/db/procurement-schema";
import {
  verifyMailgunSignature,
  type MailgunWebhookPayload,
} from "@/lib/mailgun";

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: MailgunWebhookPayload;
  try {
    body = (await request.json()) as MailgunWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Verify signature ────────────────────────────────────────────────────────
  if (!body.signature || !verifyMailgunSignature(body.signature)) {
    return Response.json({ error: "Invalid Mailgun signature" }, { status: 403 });
  }

  const eventData = body["event-data"];

  // Mailgun occasionally sends test events without event-data — ack and ignore.
  if (!eventData) {
    return Response.json({ ok: true });
  }

  const event = eventData.event;
  const mailgunMessageId = eventData.message?.headers?.["message-id"] ?? null;

  if (!mailgunMessageId) {
    // Cannot correlate to a message — ack so Mailgun doesn't retry endlessly.
    console.warn(
      "[mailgun-webhook] Received event with no message-id in headers",
      { event },
    );
    return Response.json({ ok: true });
  }

  // ── Look up the RFQ message ─────────────────────────────────────────────────
  const message = await getMessageByMailgunId(mailgunMessageId).catch((err) => {
    console.error("[mailgun-webhook] DB lookup failed", err);
    return null;
  });

  if (!message) {
    // Not our message (test send, different app, duplicate webhook) — ack cleanly.
    return Response.json({ ok: true });
  }

  // ── Map event to status + timestamp fields ──────────────────────────────────

  type StatusUpdate = {
    status: MessageStatus;
    extra?: Parameters<typeof updateMessageStatus>[2];
  };

  const now = new Date();
  let update: StatusUpdate | null = null;

  switch (event) {
    case "delivered":
      update = { status: "DELIVERED", extra: { deliveredAt: now } };
      break;

    case "opened":
      update = { status: "OPENED", extra: { openedAt: now } };
      break;

    case "failed":
      update = {
        status: "FAILED",
        extra: {
          failedAt: now,
          errorMessage:
            eventData["delivery-status"]?.message ??
            eventData["delivery-status"]?.description ??
            eventData.reason ??
            `Delivery failed (Mailgun event: ${event})`,
        },
      };
      break;

    case "complained":
      update = {
        status: "BOUNCED",
        extra: {
          failedAt: now,
          errorMessage: "Spam complaint received",
        },
      };
      break;

    case "clicked":
    case "unsubscribed":
    case "stored":
    default:
      // No status change for these events — record in audit trail and ack.
      await logAuditEvent({
        requestId: message.campaign.requestId,
        campaignId: message.campaignId,
        type: AUDIT_EVENT_TYPES.WEBHOOK_RECEIVED,
        message: `Mailgun event "${event}" for ${message.supplierEmail}`,
        metadata: {
          event,
          mailgunMessageId,
          supplierId: message.supplierId,
          supplierEmail: message.supplierEmail,
        },
      });
      return Response.json({ ok: true });
  }

  // ── Apply the message status update ────────────────────────────────────────
  try {
    await updateMessageStatus(message.id, update.status, update.extra);
  } catch (err) {
    // Still acknowledge — losing a status update is better than causing Mailgun
    // to retry the webhook indefinitely (which could create duplicate events).
    console.error("[mailgun-webhook] Failed to update message status", err);
    return Response.json({ ok: true });
  }

  // ── Derive and sync campaign status ────────────────────────────────────────
  try {
    const campaignStatus = await deriveCampaignStatus(message.campaignId);
    await updateCampaignStatus(message.campaignId, campaignStatus);
  } catch (err) {
    console.error("[mailgun-webhook] Failed to update campaign status", err);
    // Non-fatal — continue to log the audit event
  }

  // ── Audit event ─────────────────────────────────────────────────────────────
  const auditTypeMap: Record<string, string> = {
    delivered: AUDIT_EVENT_TYPES.MESSAGE_DELIVERED,
    opened: AUDIT_EVENT_TYPES.MESSAGE_OPENED,
    failed: AUDIT_EVENT_TYPES.MESSAGE_FAILED,
    complained: AUDIT_EVENT_TYPES.MESSAGE_BOUNCED,
  };

  await logAuditEvent({
    requestId: message.campaign.requestId,
    campaignId: message.campaignId,
    type: auditTypeMap[event] ?? AUDIT_EVENT_TYPES.WEBHOOK_RECEIVED,
    message: `Mailgun "${event}" for ${message.supplierEmail}`,
    metadata: {
      event,
      mailgunMessageId,
      supplierId: message.supplierId,
      supplierEmail: message.supplierEmail,
      newStatus: update.status,
    },
  });

  return Response.json({ ok: true });
}
