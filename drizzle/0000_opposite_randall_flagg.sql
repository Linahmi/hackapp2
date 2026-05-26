CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'REPLIED', 'BOUNCED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'SEARCHING', 'MATCHED', 'READY', 'SENT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('ACTIVE', 'INACTIVE', 'BLACKLISTED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"campaign_id" uuid,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"raw_prompt" text NOT NULL,
	"structured_data" jsonb,
	"status" "request_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rfq_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'PENDING' NOT NULL,
	"mailgun_message_id" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"replied_at" timestamp,
	"failed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"website" text,
	"email" text,
	"country" text,
	"status" "supplier_status" DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"reasoning" jsonb,
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_request_id_procurement_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_campaign_id_rfq_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."rfq_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_request" ADD CONSTRAINT "procurement_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_campaign" ADD CONSTRAINT "rfq_campaign_request_id_procurement_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_message" ADD CONSTRAINT "rfq_message_campaign_id_rfq_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."rfq_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_message" ADD CONSTRAINT "rfq_message_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_match" ADD CONSTRAINT "supplier_match_request_id_procurement_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procurement_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_match" ADD CONSTRAINT "supplier_match_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_event_request_id_idx" ON "audit_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_event_campaign_id_idx" ON "audit_event" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "audit_event_type_idx" ON "audit_event" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_event_created_at_idx" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "procurement_request_user_id_idx" ON "procurement_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "procurement_request_status_idx" ON "procurement_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "procurement_request_created_at_idx" ON "procurement_request" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rfq_campaign_request_id_idx" ON "rfq_campaign" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "rfq_campaign_status_idx" ON "rfq_campaign" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfq_message_campaign_id_idx" ON "rfq_message" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "rfq_message_supplier_id_idx" ON "rfq_message" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "rfq_message_status_idx" ON "rfq_message" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfq_message_mailgun_message_id_idx" ON "rfq_message" USING btree ("mailgun_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_domain_unique_idx" ON "supplier" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "supplier_status_idx" ON "supplier" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_match_request_supplier_unique_idx" ON "supplier_match" USING btree ("request_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_match_request_id_idx" ON "supplier_match" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "supplier_match_supplier_id_idx" ON "supplier_match" USING btree ("supplier_id");