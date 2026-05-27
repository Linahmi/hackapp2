CREATE TYPE "public"."quotation_status" AS ENUM('SUBMITTED', 'REVIEWED', 'SELECTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "quotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_campaign_id" uuid NOT NULL,
	"rfq_message_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"moq" integer,
	"lead_time_days" integer,
	"notes" text,
	"attachment_url" text,
	"submitted_by" text NOT NULL,
	"submitted_role" text,
	"confirmation_accepted" boolean NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"status" "quotation_status" DEFAULT 'SUBMITTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_response_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_message_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_rfq_campaign_id_rfq_campaign_id_fk" FOREIGN KEY ("rfq_campaign_id") REFERENCES "public"."rfq_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_rfq_message_id_rfq_message_id_fk" FOREIGN KEY ("rfq_message_id") REFERENCES "public"."rfq_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_response_token" ADD CONSTRAINT "supplier_response_token_rfq_message_id_rfq_message_id_fk" FOREIGN KEY ("rfq_message_id") REFERENCES "public"."rfq_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_rfq_message_unique_idx" ON "quotation" USING btree ("rfq_message_id");--> statement-breakpoint
CREATE INDEX "quotation_rfq_campaign_id_idx" ON "quotation" USING btree ("rfq_campaign_id");--> statement-breakpoint
CREATE INDEX "quotation_supplier_id_idx" ON "quotation" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "quotation_status_idx" ON "quotation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotation_submitted_at_idx" ON "quotation" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_response_token_hash_unique_idx" ON "supplier_response_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "supplier_response_token_rfq_message_id_idx" ON "supplier_response_token" USING btree ("rfq_message_id");--> statement-breakpoint
CREATE INDEX "supplier_response_token_expires_at_idx" ON "supplier_response_token" USING btree ("expires_at");