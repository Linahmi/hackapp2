/**
 * Procora development seed script.
 *
 * Populates the database with realistic fixture data for local development
 * and testing. Safe to run multiple times — suppliers use upsert-on-domain,
 * requests are always created fresh so you can accumulate fixture history.
 *
 * Run with:
 *   bun run db:seed
 *
 * Requires DATABASE_URL in .env (the script loads it automatically).
 */

import { loadEnvConfig } from "@next/env";

// Must run before any module that imports `env`
loadEnvConfig(process.cwd());

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as authSchema from "../db/schema";
import * as procurementSchema from "../db/procurement-schema";
import {
  procurementRequest,
  rfqCampaign,
  rfqMessage,
  supplier,
  supplierMatch,
  auditEvent,
  AUDIT_EVENT_TYPES,
} from "../db/procurement-schema";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, {
  schema: { ...authSchema, ...procurementSchema },
});

// ─────────────────────────────────────────────────────────────
// Seed data
// ─────────────────────────────────────────────────────────────

const seedSuppliers = [
  {
    name: "CDW",
    domain: "cdw.com",
    website: "https://www.cdw.com",
    email: "publicsector@cdw.com",
    country: "United States",
    status: "ACTIVE" as const,
    metadata: {
      score: 88,
      estimatedFit: 0.88,
      metrics: {
        resourceFit: 0.9,
        bulkFit: 0.92,
        locationFit: 0.85,
        budgetFit: 0.8,
        complianceFit: 0.78,
        deliveryFit: 0.87,
        specificationFit: 0.85,
        reliability: 0.92,
      },
      snippet:
        "CDW is a leading multi-brand technology solutions provider for business, government, education, and healthcare in the US, the UK and Canada.",
    },
  },
  {
    name: "Insight Direct",
    domain: "insight.com",
    website: "https://www.insight.com",
    email: "enterprise@insight.com",
    country: "United States",
    status: "ACTIVE" as const,
    metadata: {
      score: 84,
      estimatedFit: 0.84,
      metrics: {
        resourceFit: 0.88,
        bulkFit: 0.86,
        locationFit: 0.82,
        budgetFit: 0.78,
        complianceFit: 0.8,
        deliveryFit: 0.84,
        specificationFit: 0.82,
        reliability: 0.88,
      },
      snippet:
        "Insight is a Fortune 500 solutions integrator helping organizations accelerate transformation by unlocking the power of people and technology.",
    },
  },
  {
    name: "Dustin AB",
    domain: "dustin.se",
    website: "https://www.dustin.se",
    email: "corporate@dustin.se",
    country: "Sweden",
    status: "ACTIVE" as const,
    metadata: {
      score: 79,
      estimatedFit: 0.79,
      metrics: {
        resourceFit: 0.82,
        bulkFit: 0.8,
        locationFit: 0.88,
        budgetFit: 0.75,
        complianceFit: 0.76,
        deliveryFit: 0.81,
        specificationFit: 0.78,
        reliability: 0.82,
      },
      snippet:
        "Dustin is one of the leading online IT retailers in the Nordics, serving corporate customers with a wide range of IT products and services.",
    },
  },
  {
    name: "Bechtle AG",
    domain: "bechtle.com",
    website: "https://www.bechtle.com",
    email: "sales@bechtle.com",
    country: "Germany",
    status: "ACTIVE" as const,
    metadata: {
      score: 81,
      estimatedFit: 0.81,
      metrics: {
        resourceFit: 0.85,
        bulkFit: 0.82,
        locationFit: 0.9,
        budgetFit: 0.77,
        complianceFit: 0.82,
        deliveryFit: 0.8,
        specificationFit: 0.8,
        reliability: 0.85,
      },
      snippet:
        "Bechtle is one of Europe's leading IT companies offering a comprehensive portfolio of IT infrastructure, cloud computing, and workplace solutions.",
    },
  },
  {
    name: "Econocom",
    domain: "econocom.com",
    website: "https://www.econocom.com",
    email: null,
    country: "France",
    status: "ACTIVE" as const,
    metadata: {
      score: 72,
      estimatedFit: 0.72,
      metrics: {
        resourceFit: 0.74,
        bulkFit: 0.78,
        locationFit: 0.85,
        budgetFit: 0.7,
        complianceFit: 0.74,
        deliveryFit: 0.71,
        specificationFit: 0.68,
        reliability: 0.76,
      },
      snippet:
        "Econocom is a European group specialising in digital transformation for companies and public institutions, offering IT leasing, financing, and procurement.",
    },
  },
];

const seedRequestPayload = {
  title: "100 Dell Latitude 5540 laptops — EMEA delivery",
  rawPrompt:
    "We need to procure 100 Dell Latitude 5540 laptops with Intel Core i5-1345U, 16GB RAM, 512GB SSD for our European offices. Budget is €95,000 total. Delivery to Paris, France by end of July. Must be ISO 27001 compliant supplier.",
  structuredData: {
    resourceType: "laptop",
    quantity: 100,
    budget: { amount: 95000, currency: "EUR", type: "total" },
    deliveryDate: "2026-07-31",
    location: "Paris",
    locationCountry: "France",
    locationRegion: "Île-de-France",
    locationValidatedBy: "gazetteer",
    specifications: [
      "Dell Latitude 5540",
      "Intel Core i5-1345U",
      "16GB RAM",
      "512GB SSD",
    ],
    constraints: ["ISO 27001"],
    priority: "medium",
    ignoredFields: [],
  },
};

// ─────────────────────────────────────────────────────────────
// Seed execution
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Starting Procora seed...\n");

  // 1. Upsert suppliers
  console.log(`   Upserting ${seedSuppliers.length} suppliers...`);
  const insertedSuppliers = await Promise.all(
    seedSuppliers.map((s) =>
      db
        .insert(supplier)
        .values(s)
        .onConflictDoUpdate({
          target: supplier.domain,
          set: {
            name: s.name,
            website: s.website,
            email: s.email,
            country: s.country,
            metadata: s.metadata,
            updatedAt: new Date(),
          },
        })
        .returning()
        .then(([row]) => {
          if (!row) throw new Error(`Failed to upsert supplier: ${s.domain}`);
          return row;
        }),
    ),
  );
  console.log(`   ✓ Suppliers ready: ${insertedSuppliers.map((s) => s.name).join(", ")}\n`);

  // 2. Create a sample procurement request (always fresh, no upsert)
  console.log("   Creating sample procurement request...");
  const [request] = await db
    .insert(procurementRequest)
    .values({
      ...seedRequestPayload,
      status: "MATCHED",
    })
    .returning();
  if (!request) throw new Error("Failed to create seed request");
  console.log(`   ✓ Request: "${request.title}" (${request.id})\n`);

  // 3. Create supplier matches (top 3 suppliers for this request)
  console.log("   Creating supplier matches...");
  const matchData = insertedSuppliers
    .slice(0, 3)
    .map((s, i) => ({
      requestId: request.id,
      supplierId: s.id,
      matchScore: seedSuppliers[i]!.metadata.score,
      reasoning: seedSuppliers[i]!.metadata.metrics,
      selected: i === 0, // First supplier pre-selected
    }));
  await db.insert(supplierMatch).values(matchData).onConflictDoNothing();
  console.log(`   ✓ ${matchData.length} supplier matches created\n`);

  // 4. Create a draft RFQ campaign
  console.log("   Creating draft RFQ campaign...");
  const [campaign] = await db
    .insert(rfqCampaign)
    .values({ requestId: request.id, status: "DRAFT" })
    .returning();
  if (!campaign) throw new Error("Failed to create seed campaign");
  console.log(`   ✓ Campaign: ${campaign.id} (status: ${campaign.status})\n`);

  // 5. Create draft RFQ messages for the top 3 suppliers
  console.log("   Creating draft RFQ messages...");
  const messageBody = (supplierName: string) => `Hello ${supplierName} team,

Procora is preparing a procurement request and we would like to request a formal quotation.

Requested resource: Dell Latitude 5540 Laptop
Quantity: 100 units
Budget: €95,000 total
Delivery deadline: 2026-07-31
Delivery location: Paris, France
Specifications: Dell Latitude 5540, Intel Core i5-1345U, 16GB RAM, 512GB SSD
Compliance or constraints: ISO 27001

Please confirm price, stock availability, delivery timing, warranty terms, compliance documentation, and quote validity period.

Regards,
Procora`;

  const messageDrafts = insertedSuppliers.slice(0, 3).map((s) => ({
    campaignId: campaign.id,
    supplierId: s.id,
    supplierEmail: s.email ?? `sales@${s.domain}`,
    subject: `Request for quotation: 100 Dell Latitude 5540 laptops`,
    body: messageBody(s.name),
    status: "PENDING" as const,
  }));
  const insertedMessages = await db
    .insert(rfqMessage)
    .values(messageDrafts)
    .returning();
  console.log(`   ✓ ${insertedMessages.length} draft messages created\n`);

  // 6. Write audit trail
  console.log("   Writing audit trail...");
  await db.insert(auditEvent).values([
    {
      requestId: request.id,
      type: AUDIT_EVENT_TYPES.REQUEST_CREATED,
      message: "Procurement request created from user prompt",
      metadata: { rawPromptLength: seedRequestPayload.rawPrompt.length },
    },
    {
      requestId: request.id,
      type: AUDIT_EVENT_TYPES.SEARCH_COMPLETED,
      message: `Supplier search returned ${insertedSuppliers.length} candidates`,
      metadata: { supplierCount: insertedSuppliers.length },
    },
    {
      requestId: request.id,
      type: AUDIT_EVENT_TYPES.SUPPLIER_SELECTED,
      message: `${insertedSuppliers[0]!.name} selected for RFQ campaign`,
      metadata: { supplierId: insertedSuppliers[0]!.id },
    },
    {
      requestId: request.id,
      campaignId: campaign.id,
      type: AUDIT_EVENT_TYPES.CAMPAIGN_CREATED,
      message: "RFQ campaign created in DRAFT status",
      metadata: { messageCount: insertedMessages.length },
    },
  ]);
  console.log("   ✓ Audit events written\n");

  console.log("✅  Seed complete.\n");
  console.log("   Summary:");
  console.log(`   - ${insertedSuppliers.length} suppliers in registry`);
  console.log(`   - 1 procurement request: "${request.title}"`);
  console.log(`   - 1 RFQ campaign (DRAFT) with ${insertedMessages.length} messages`);
  console.log(`   - 4 audit events\n`);
  console.log("   Request ID:", request.id);
  console.log("   Campaign ID:", campaign.id);
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err);
  process.exit(1);
});
