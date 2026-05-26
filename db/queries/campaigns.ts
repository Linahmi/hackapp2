/**
 * RFQ Campaign and Message query helpers.
 *
 * Campaign lifecycle:
 *   createCampaign() → addMessagesToCampaign() → markCampaignSending()
 *   → updateMessageStatus() (per Mailgun webhook) → deriveCampaignStatus()
 *
 * All status transitions are explicit — no implicit state machine here.
 * The calling service is responsible for also writing an AuditEvent.
 */

import { eq } from "drizzle-orm";

import { db } from "../index";
import {
  rfqCampaign,
  rfqMessage,
  type CampaignStatus,
  type MessageStatus,
  type NewRfqCampaign,
  type NewRfqMessage,
} from "../procurement-schema";

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function createCampaign(
  data: Pick<NewRfqCampaign, "requestId">,
) {
  const [row] = await db
    .insert(rfqCampaign)
    .values({ ...data, status: "DRAFT" })
    .returning();
  if (!row) throw new Error("Failed to create RFQ campaign");
  return row;
}

export async function getCampaignById(id: string) {
  return db.query.rfqCampaign.findFirst({
    where: eq(rfqCampaign.id, id),
    with: {
      request: true,
      messages: {
        with: { supplier: true },
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  });
}

export async function getCampaignByRequestId(requestId: string) {
  return db.query.rfqCampaign.findFirst({
    where: eq(rfqCampaign.requestId, requestId),
    with: {
      messages: {
        with: { supplier: true },
      },
    },
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus,
  sentAt?: Date,
) {
  const [row] = await db
    .update(rfqCampaign)
    .set({ status, ...(sentAt ? { sentAt } : {}) })
    .where(eq(rfqCampaign.id, id))
    .returning();
  if (!row) throw new Error(`Campaign ${id} not found`);
  return row;
}

// ── Messages ─────────────────────────────────────────────────────────────────

/**
 * Bulk-insert all messages for a campaign in a single statement.
 * Call this after createCampaign() before changing status to SENDING.
 */
export async function addMessagesToCampaign(
  messages: Omit<NewRfqMessage, "id">[],
) {
  if (messages.length === 0) return [];
  return db.insert(rfqMessage).values(messages).returning();
}

export async function getMessageById(id: string) {
  return db.query.rfqMessage.findFirst({
    where: eq(rfqMessage.id, id),
    with: { supplier: true, campaign: true },
  });
}

/**
 * Look up a message by Mailgun's message ID.
 * Used by the Mailgun webhook handler to correlate delivery events.
 */
export async function getMessageByMailgunId(mailgunMessageId: string) {
  return db.query.rfqMessage.findFirst({
    where: eq(rfqMessage.mailgunMessageId, mailgunMessageId),
    with: { campaign: true, supplier: true },
  });
}

/**
 * Update a message's status and the appropriate lifecycle timestamp.
 * Also sets mailgunMessageId on first successful dispatch.
 */
export async function updateMessageStatus(
  id: string,
  status: MessageStatus,
  extra?: {
    mailgunMessageId?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    repliedAt?: Date;
    failedAt?: Date;
    errorMessage?: string;
  },
) {
  const [row] = await db
    .update(rfqMessage)
    .set({ status, ...extra })
    .where(eq(rfqMessage.id, id))
    .returning();
  if (!row) throw new Error(`Message ${id} not found`);
  return row;
}

/**
 * Bulk-update all PENDING messages in a campaign to QUEUED
 * once the campaign dispatch has started.
 */
export async function markMessagesQueued(campaignId: string) {
  return db
    .update(rfqMessage)
    .set({ status: "QUEUED" })
    .where(
      eq(rfqMessage.campaignId, campaignId),
    )
    .returning();
}

/**
 * Derive the campaign's aggregate status from its messages.
 * Call this after processing a webhook to keep the campaign status in sync.
 *
 * Rules:
 *   - All FAILED/BOUNCED           → FAILED
 *   - All SENT/DELIVERED/OPENED    → SENT
 *   - Mix of success + failure     → PARTIALLY_SENT
 *   - Any still PENDING/QUEUED     → SENDING (still in flight)
 */
export async function deriveCampaignStatus(
  campaignId: string,
): Promise<CampaignStatus> {
  const messages = await db.query.rfqMessage.findMany({
    where: eq(rfqMessage.campaignId, campaignId),
    columns: { status: true },
  });

  if (messages.length === 0) return "DRAFT";

  const terminal = new Set<MessageStatus>([
    "SENT",
    "DELIVERED",
    "OPENED",
    "REPLIED",
    "BOUNCED",
    "FAILED",
  ]);
  const success = new Set<MessageStatus>([
    "SENT",
    "DELIVERED",
    "OPENED",
    "REPLIED",
  ]);
  const failure = new Set<MessageStatus>(["BOUNCED", "FAILED"]);

  const allTerminal = messages.every((m) => terminal.has(m.status));
  if (!allTerminal) return "SENDING";

  const hasSuccess = messages.some((m) => success.has(m.status));
  const hasFailure = messages.some((m) => failure.has(m.status));

  if (hasSuccess && hasFailure) return "PARTIALLY_SENT";
  if (hasSuccess) return "SENT";
  return "FAILED";
}
