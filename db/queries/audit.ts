/**
 * AuditEvent query helpers.
 *
 * The audit log is append-only. These helpers make it easy to write
 * structured events throughout the procurement workflow.
 *
 * Usage pattern:
 *   import { logAuditEvent, AUDIT_EVENT_TYPES } from "@/db/queries"
 *
 *   await logAuditEvent({
 *     requestId: req.id,
 *     type: AUDIT_EVENT_TYPES.SEARCH_COMPLETED,
 *     message: `Found ${results.length} suppliers`,
 *     metadata: { count: results.length, queryUsed },
 *   })
 */

import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
  AUDIT_EVENT_TYPES,
  auditEvent,
  type AuditEventType,
  type NewAuditEvent,
} from "../procurement-schema";

export { AUDIT_EVENT_TYPES };
export type { AuditEventType };

type LogAuditEventInput = Pick<
  NewAuditEvent,
  "type" | "message" | "metadata"
> & {
  requestId?: string;
  campaignId?: string;
};

/**
 * Append a new audit event. Never throws — audit failures should not
 * interrupt the main workflow. Logs to console.error on failure instead.
 */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    await db.insert(auditEvent).values({
      type: input.type,
      message: input.message,
      metadata: input.metadata ?? null,
      requestId: input.requestId ?? null,
      campaignId: input.campaignId ?? null,
    });
  } catch (err) {
    // Audit log failure must never crash the calling workflow
    console.error("[audit] Failed to write audit event", input.type, err);
  }
}

/**
 * Fetch the full audit trail for a procurement request, oldest-first.
 * Used in the UI to render the phase timeline.
 */
export async function getAuditTrailForRequest(requestId: string) {
  return db.query.auditEvent.findMany({
    where: eq(auditEvent.requestId, requestId),
    orderBy: [desc(auditEvent.createdAt)],
  });
}

/**
 * Fetch audit events for a specific campaign (e.g. delivery receipts).
 */
export async function getAuditTrailForCampaign(campaignId: string) {
  return db.query.auditEvent.findMany({
    where: eq(auditEvent.campaignId, campaignId),
    orderBy: [desc(auditEvent.createdAt)],
  });
}
