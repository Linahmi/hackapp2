/**
 * Procora — Procurement Schema
 *
 * Kept separate from db/schema.ts (which is owned by better-auth's `auth:generate`
 * command and will be overwritten on every auth schema regeneration).
 *
 * Models in this file form the core of Procora's workflow engine:
 *   ProcurementRequest → SupplierMatch ← Supplier
 *   ProcurementRequest → RfqCampaign   → RfqMessage → Supplier
 *   ProcurementRequest → AuditEvent
 *
 * Design principles:
 *   - UUIDs for all PKs (gen_random_uuid via defaultRandom())
 *   - Explicit timestamps on every mutable row
 *   - Nullable FK on userId so anonymous / API-driven requests are valid
 *   - jsonb for structured data that evolves independently of schema migrations
 *   - No cascading deletes on supplier (suppliers are shared across campaigns)
 *   - AuditEvent is append-only; never update or delete rows from it
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./schema";

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

/**
 * Lifecycle of a procurement request from initial prompt to completion.
 *
 * DRAFT      → rawPrompt saved, not yet searched
 * SEARCHING  → supplier search in progress
 * MATCHED    → suppliers found and scored
 * READY      → RFQ email drafted, ready to send
 * SENT       → at least one RFQ campaign dispatched
 * COMPLETED  → supplier replied / deal closed
 * CANCELLED  → user abandoned the request
 */
export const requestStatus = pgEnum("request_status", [
  "DRAFT",
  "SEARCHING",
  "MATCHED",
  "READY",
  "SENT",
  "COMPLETED",
  "CANCELLED",
]);

/**
 * Status of an RFQ campaign (a batch of emails to multiple suppliers
 * for a single procurement request).
 *
 * DRAFT          → created, messages not yet sent
 * SENDING        → dispatch in progress
 * SENT           → all messages accepted by Mailgun
 * PARTIALLY_SENT → some messages failed, others sent
 * FAILED         → all messages failed
 */
export const campaignStatus = pgEnum("campaign_status", [
  "DRAFT",
  "SENDING",
  "SENT",
  "PARTIALLY_SENT",
  "FAILED",
]);

/**
 * Per-message delivery lifecycle.
 * Mirrors Mailgun webhook event names for easy mapping.
 *
 * PENDING   → not yet sent (queued locally)
 * QUEUED    → accepted by Mailgun, in their queue
 * SENT      → Mailgun accepted and attempted delivery
 * DELIVERED → confirmed delivered to recipient MTA
 * OPENED    → recipient opened the email (Mailgun tracking pixel)
 * REPLIED   → supplier sent a reply (detected via inbound webhook)
 * BOUNCED   → permanent delivery failure (hard bounce)
 * FAILED    → send-time error (bad address, Mailgun rejection, etc.)
 */
export const messageStatus = pgEnum("message_status", [
  "PENDING",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "REPLIED",
  "BOUNCED",
  "FAILED",
]);

/**
 * Status of a supplier in our registry.
 *
 * ACTIVE      → usable in new campaigns
 * INACTIVE    → temporarily disabled (e.g. no email found)
 * BLACKLISTED → do not contact (user or system flagged)
 */
export const supplierStatus = pgEnum("supplier_status", [
  "ACTIVE",
  "INACTIVE",
  "BLACKLISTED",
]);

/**
 * Quotation review lifecycle after a supplier responds.
 */
export const quotationStatus = pgEnum("quotation_status", [
  "SUBMITTED",
  "REVIEWED",
  "SELECTED",
  "REJECTED",
]);

/**
 * Approval state for a buyer's supplier selection decision.
 */
export const selectionStatus = pgEnum("selection_status", [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
]);

// ─────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────

/**
 * The central entity. One row per procurement request created by a user.
 *
 * structuredData holds the NormalizedProcurementRequest (budget, specs,
 * location, delivery date, etc.) produced by the extraction pipeline.
 * It lives in jsonb so it can evolve without migrations.
 */
export const procurementRequest = pgTable(
  "procurement_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: allows anonymous / API-driven requests in future
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    rawPrompt: text("raw_prompt").notNull(),
    // Full NormalizedProcurementRequest as produced by lib/procurement-search.ts
    structuredData: jsonb("structured_data"),
    status: requestStatus("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("procurement_request_user_id_idx").on(t.userId),
    index("procurement_request_status_idx").on(t.status),
    index("procurement_request_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Persistent supplier registry.
 *
 * Suppliers are discovered dynamically by the Exa search pipeline and
 * upserted here on first encounter (keyed by domain). The registry grows
 * over time as the platform sees more searches. metadata holds the full
 * ProcurementSupplierResult payload so nothing is lost.
 */
export const supplier = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Domain is the stable identifier (e.g. "acme.com"). Unique.
    domain: text("domain").notNull(),
    website: text("website"),
    // Email is nullable — may not be known at match time; populated before send
    email: text("email"),
    country: text("country"),
    status: supplierStatus("status").notNull().default("ACTIVE"),
    // Full ProcurementSupplierResult JSON including metrics, evidence, links
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("supplier_domain_unique_idx").on(t.domain),
    index("supplier_status_idx").on(t.status),
  ],
);

/**
 * Junction table: which suppliers were matched to which request,
 * with their scores and whether the user selected them for an RFQ.
 *
 * One row per (request, supplier) pair. The unique index prevents
 * duplicate entries when a supplier appears in multiple search variants.
 *
 * reasoning holds the metricEvidence object for full auditability.
 */
export const supplierMatch = pgTable(
  "supplier_match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequest.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "cascade" }),
    // Procora's 0–100 weighted score from the procurement search pipeline
    matchScore: integer("match_score").notNull().default(0),
    // Full metricEvidence JSON (resourceFit, locationFit, bulkFit, etc.)
    reasoning: jsonb("reasoning"),
    // True when the user clicked "select" for this supplier
    selected: boolean("selected").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("supplier_match_request_supplier_unique_idx").on(
      t.requestId,
      t.supplierId,
    ),
    index("supplier_match_request_id_idx").on(t.requestId),
    index("supplier_match_supplier_id_idx").on(t.supplierId),
  ],
);

/**
 * An RFQ campaign groups all outbound emails for one procurement request.
 *
 * One campaign per request for now (enforced by application logic, not DB).
 * The schema allows many-to-one (requestId not unique) so a user can
 * retry a failed campaign or send a follow-up without a schema change.
 */
export const rfqCampaign = pgTable(
  "rfq_campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequest.id, { onDelete: "cascade" }),
    status: campaignStatus("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Set when the first message is dispatched
    sentAt: timestamp("sent_at"),
  },
  (t) => [
    index("rfq_campaign_request_id_idx").on(t.requestId),
    index("rfq_campaign_status_idx").on(t.status),
  ],
);

/**
 * One outbound email per supplier per campaign.
 *
 * All Mailgun-specific fields are nullable and pre-wired for the
 * integration — set them when Mailgun is enabled without a schema change.
 *
 * Lifecycle timestamps are all nullable; set each as the corresponding
 * Mailgun webhook fires. This gives us a full audit trail per message.
 */
export const rfqMessage = pgTable(
  "rfq_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => rfqCampaign.id, { onDelete: "cascade" }),
    // Restrict delete: can't remove a supplier that has live messages
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    // Denormalised for auditability — the email address at send time
    supplierEmail: text("supplier_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: messageStatus("status").notNull().default("PENDING"),

    // ── Mailgun fields ──────────────────────────────────────────────────
    // Populated by Mailgun API response on successful dispatch
    mailgunMessageId: text("mailgun_message_id"),

    // ── Lifecycle timestamps (webhook-driven) ───────────────────────────
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    openedAt: timestamp("opened_at"),
    repliedAt: timestamp("replied_at"),
    failedAt: timestamp("failed_at"),
    // Mailgun error description or our own error message on failure
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("rfq_message_campaign_id_idx").on(t.campaignId),
    index("rfq_message_supplier_id_idx").on(t.supplierId),
    index("rfq_message_status_idx").on(t.status),
    // Fast Mailgun webhook lookup by message ID
    index("rfq_message_mailgun_message_id_idx").on(t.mailgunMessageId),
  ],
);

/**
 * Secure response tokens for public supplier quotation submission.
 *
 * Raw tokens are never stored. Only the SHA-256 hash is persisted.
 * Multiple tokens may exist for the same RFQ message over time (for example,
 * if a campaign is resent), but each token is single-use via usedAt.
 */
export const supplierResponseToken = pgTable(
  "supplier_response_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqMessageId: uuid("rfq_message_id")
      .notNull()
      .references(() => rfqMessage.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("supplier_response_token_hash_unique_idx").on(t.tokenHash),
    index("supplier_response_token_rfq_message_id_idx").on(t.rfqMessageId),
    index("supplier_response_token_expires_at_idx").on(t.expiresAt),
  ],
);

/**
 * Structured supplier quotation linked to a campaign, message, and supplier.
 */
export const quotation = pgTable(
  "quotation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqCampaignId: uuid("rfq_campaign_id")
      .notNull()
      .references(() => rfqCampaign.id, { onDelete: "cascade" }),
    rfqMessageId: uuid("rfq_message_id")
      .notNull()
      .references(() => rfqMessage.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
    moq: integer("moq"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    attachmentUrl: text("attachment_url"),
    submittedBy: text("submitted_by").notNull(),
    submittedRole: text("submitted_role"),
    confirmationAccepted: boolean("confirmation_accepted").notNull(),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    status: quotationStatus("status").notNull().default("SUBMITTED"),
  },
  (t) => [
    uniqueIndex("quotation_rfq_message_unique_idx").on(t.rfqMessageId),
    index("quotation_rfq_campaign_id_idx").on(t.rfqCampaignId),
    index("quotation_supplier_id_idx").on(t.supplierId),
    index("quotation_status_idx").on(t.status),
    index("quotation_submitted_at_idx").on(t.submittedAt),
  ],
);

/**
 * Append-only event log for full procurement lifecycle auditability.
 *
 * type is plain text (not an enum) so new event types can be added at
 * any time without a schema migration. Use the AUDIT_EVENT_TYPES constant
 * in application code to keep the set of types consistent.
 *
 * Never UPDATE or DELETE rows in this table.
 * requestId and campaignId are both nullable for system-level events.
 */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").references(() => procurementRequest.id, {
      onDelete: "cascade",
    }),
    campaignId: uuid("campaign_id").references(() => rfqCampaign.id, {
      onDelete: "cascade",
    }),
    // e.g. "REQUEST_CREATED", "SUPPLIER_MATCHED", "MESSAGE_DELIVERED"
    type: text("type").notNull(),
    message: text("message").notNull(),
    // Freeform payload: before/after state, counts, error details, etc.
    metadata: jsonb("metadata"),
    // No updatedAt — this table is append-only
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_event_request_id_idx").on(t.requestId),
    index("audit_event_campaign_id_idx").on(t.campaignId),
    index("audit_event_type_idx").on(t.type),
    index("audit_event_created_at_idx").on(t.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// Relations (Drizzle relational query API)
// ─────────────────────────────────────────────────────────────

export const procurementRequestRelations = relations(
  procurementRequest,
  ({ one, many }) => ({
    user: one(user, {
      fields: [procurementRequest.userId],
      references: [user.id],
    }),
    matches: many(supplierMatch),
    campaigns: many(rfqCampaign),
    auditEvents: many(auditEvent),
  }),
);

export const supplierRelations = relations(supplier, ({ many }) => ({
  matches: many(supplierMatch),
  messages: many(rfqMessage),
  quotations: many(quotation),
}));

export const supplierMatchRelations = relations(supplierMatch, ({ one }) => ({
  request: one(procurementRequest, {
    fields: [supplierMatch.requestId],
    references: [procurementRequest.id],
  }),
  supplier: one(supplier, {
    fields: [supplierMatch.supplierId],
    references: [supplier.id],
  }),
}));

export const rfqCampaignRelations = relations(rfqCampaign, ({ one, many }) => ({
  request: one(procurementRequest, {
    fields: [rfqCampaign.requestId],
    references: [procurementRequest.id],
  }),
  messages: many(rfqMessage),
  quotations: many(quotation),
  auditEvents: many(auditEvent),
}));

export const rfqMessageRelations = relations(rfqMessage, ({ one, many }) => ({
  campaign: one(rfqCampaign, {
    fields: [rfqMessage.campaignId],
    references: [rfqCampaign.id],
  }),
  supplier: one(supplier, {
    fields: [rfqMessage.supplierId],
    references: [supplier.id],
  }),
  responseTokens: many(supplierResponseToken),
  quotations: many(quotation),
}));

export const supplierResponseTokenRelations = relations(
  supplierResponseToken,
  ({ one }) => ({
    rfqMessage: one(rfqMessage, {
      fields: [supplierResponseToken.rfqMessageId],
      references: [rfqMessage.id],
    }),
  }),
);

export const quotationRelations = relations(quotation, ({ one }) => ({
  campaign: one(rfqCampaign, {
    fields: [quotation.rfqCampaignId],
    references: [rfqCampaign.id],
  }),
  rfqMessage: one(rfqMessage, {
    fields: [quotation.rfqMessageId],
    references: [rfqMessage.id],
  }),
  supplier: one(supplier, {
    fields: [quotation.supplierId],
    references: [supplier.id],
  }),
}));

export const auditEventRelations = relations(auditEvent, ({ one }) => ({
  request: one(procurementRequest, {
    fields: [auditEvent.requestId],
    references: [procurementRequest.id],
  }),
  campaign: one(rfqCampaign, {
    fields: [auditEvent.campaignId],
    references: [rfqCampaign.id],
  }),
}));

/**
 * One row per user — stores their sender identity used in outbound RFQ emails.
 * Upserted on save (userId is unique).
 */
/**
 * In-app notifications for buyers.
 * Append-only — never delete rows, just set readAt.
 */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notification_user_id_idx").on(t.userId),
    index("notification_read_at_idx").on(t.readAt),
    index("notification_created_at_idx").on(t.createdAt),
  ],
);

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));

export const companySettings = pgTable("company_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  companyName: text("company_name"),
  senderName: text("sender_name"),
  senderRole: text("sender_role"),
  senderEmail: text("sender_email"),
  logoUrl: text("logo_url"),
  signature: text("signature"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const companySettingsRelations = relations(companySettings, ({ one }) => ({
  user: one(user, {
    fields: [companySettings.userId],
    references: [user.id],
  }),
}));

/**
 * Buyer's final supplier selection decision for a procurement request.
 * A single requestId can have multiple rows over time (e.g. re-selections),
 * but only one row with status != REJECTED is meaningful at a time.
 */
export const supplierSelection = pgTable(
  "supplier_selection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequest.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotation.id, { onDelete: "restrict" }),
    selectedBy: text("selected_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    justification: text("justification").notNull(),
    selectedAt: timestamp("selected_at").defaultNow().notNull(),
    status: selectionStatus("status").notNull().default("PENDING_APPROVAL"),
  },
  (t) => [
    index("supplier_selection_request_id_idx").on(t.requestId),
    index("supplier_selection_quotation_id_idx").on(t.quotationId),
    index("supplier_selection_status_idx").on(t.status),
  ],
);

export const supplierSelectionRelations = relations(supplierSelection, ({ one }) => ({
  request: one(procurementRequest, {
    fields: [supplierSelection.requestId],
    references: [procurementRequest.id],
  }),
  quotation: one(quotation, {
    fields: [supplierSelection.quotationId],
    references: [quotation.id],
  }),
  selectedByUser: one(user, {
    fields: [supplierSelection.selectedBy],
    references: [user.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────

export type ProcurementRequest = typeof procurementRequest.$inferSelect;
export type NewProcurementRequest = typeof procurementRequest.$inferInsert;

export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;

export type SupplierMatch = typeof supplierMatch.$inferSelect;
export type NewSupplierMatch = typeof supplierMatch.$inferInsert;

export type RfqCampaign = typeof rfqCampaign.$inferSelect;
export type NewRfqCampaign = typeof rfqCampaign.$inferInsert;

export type RfqMessage = typeof rfqMessage.$inferSelect;
export type NewRfqMessage = typeof rfqMessage.$inferInsert;

export type SupplierResponseToken = typeof supplierResponseToken.$inferSelect;
export type NewSupplierResponseToken = typeof supplierResponseToken.$inferInsert;

export type Quotation = typeof quotation.$inferSelect;
export type NewQuotation = typeof quotation.$inferInsert;

export type AuditEvent = typeof auditEvent.$inferSelect;
export type NewAuditEvent = typeof auditEvent.$inferInsert;

export type CompanySettings = typeof companySettings.$inferSelect;
export type NewCompanySettings = typeof companySettings.$inferInsert;

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;

export type SupplierSelection = typeof supplierSelection.$inferSelect;
export type NewSupplierSelection = typeof supplierSelection.$inferInsert;
export type SelectionStatus = (typeof selectionStatus.enumValues)[number];

// Enum value unions (use these in application code instead of raw strings)
export type RequestStatus = (typeof requestStatus.enumValues)[number];
export type CampaignStatus = (typeof campaignStatus.enumValues)[number];
export type MessageStatus = (typeof messageStatus.enumValues)[number];
export type SupplierStatus = (typeof supplierStatus.enumValues)[number];
export type QuotationStatus = (typeof quotationStatus.enumValues)[number];

/**
 * Canonical audit event type strings.
 * Defined as a const object so editors get autocomplete and typos are caught.
 */
export const AUDIT_EVENT_TYPES = {
  REQUEST_CREATED: "REQUEST_CREATED",
  SEARCH_STARTED: "SEARCH_STARTED",
  SEARCH_COMPLETED: "SEARCH_COMPLETED",
  SUPPLIER_MATCHED: "SUPPLIER_MATCHED",
  SUPPLIER_SELECTED: "SUPPLIER_SELECTED",
  CAMPAIGN_CREATED: "CAMPAIGN_CREATED",
  CAMPAIGN_SENDING: "CAMPAIGN_SENDING",
  CAMPAIGN_SENT: "CAMPAIGN_SENT",
  CAMPAIGN_FAILED: "CAMPAIGN_FAILED",
  MESSAGE_QUEUED: "MESSAGE_QUEUED",
  MESSAGE_SENT: "MESSAGE_SENT",
  MESSAGE_DELIVERED: "MESSAGE_DELIVERED",
  MESSAGE_OPENED: "MESSAGE_OPENED",
  MESSAGE_REPLIED: "MESSAGE_REPLIED",
  MESSAGE_BOUNCED: "MESSAGE_BOUNCED",
  MESSAGE_FAILED: "MESSAGE_FAILED",
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  STATUS_CHANGED: "STATUS_CHANGED",
  SUPPLIER_RESPONSE_LINK_CREATED: "supplier_response_link_created",
  SUPPLIER_RESPONSE_PAGE_OPENED: "supplier_response_page_opened",
  QUOTATION_SUBMITTED: "quotation_submitted",
  RFQ_MESSAGE_REPLIED: "rfq_message_replied",
  COMPANY_SETTINGS_UPDATED: "company_settings_updated",
} as const;

export type AuditEventType =
  (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
