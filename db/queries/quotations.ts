import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "../index";
import {
  quotation,
  supplierResponseToken,
  type NewQuotation,
  type NewSupplierResponseToken,
  type QuotationStatus,
} from "../procurement-schema";

export async function createSupplierResponseToken(
  data: Pick<NewSupplierResponseToken, "rfqMessageId" | "tokenHash" | "expiresAt">,
) {
  const [row] = await db
    .insert(supplierResponseToken)
    .values({
      rfqMessageId: data.rfqMessageId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    })
    .returning();
  if (!row) throw new Error("Failed to create supplier response token");
  return row;
}

export async function getSupplierResponseTokenByHash(tokenHash: string) {
  return db.query.supplierResponseToken.findFirst({
    where: eq(supplierResponseToken.tokenHash, tokenHash),
    with: {
      rfqMessage: {
        with: {
          supplier: true,
          campaign: {
            with: {
              request: {
                with: {
                  user: true,
                },
              },
            },
          },
          quotations: true,
        },
      },
    },
  });
}

export async function getActiveSupplierResponseTokenByHash(tokenHash: string) {
  return db.query.supplierResponseToken.findFirst({
    where: and(
      eq(supplierResponseToken.tokenHash, tokenHash),
      isNull(supplierResponseToken.usedAt),
      gt(supplierResponseToken.expiresAt, new Date()),
    ),
    with: {
      rfqMessage: {
        with: {
          supplier: true,
          campaign: {
            with: {
              request: {
                with: {
                  user: true,
                },
              },
            },
          },
          quotations: true,
        },
      },
    },
  });
}

export async function markSupplierResponseTokenUsed(id: string, usedAt = new Date()) {
  const [row] = await db
    .update(supplierResponseToken)
    .set({ usedAt })
    .where(eq(supplierResponseToken.id, id))
    .returning();
  if (!row) throw new Error(`Supplier response token ${id} not found`);
  return row;
}

export async function createQuotation(
  data: Omit<NewQuotation, "id" | "submittedAt" | "status"> & {
    status?: QuotationStatus;
    submittedAt?: Date;
  },
) {
  const [row] = await db
    .insert(quotation)
    .values({
      ...data,
      status: data.status ?? "SUBMITTED",
      submittedAt: data.submittedAt ?? new Date(),
    })
    .returning();
  if (!row) throw new Error("Failed to create quotation");
  return row;
}

export async function getQuotationByMessageId(rfqMessageId: string) {
  return db.query.quotation.findFirst({
    where: eq(quotation.rfqMessageId, rfqMessageId),
    with: {
      supplier: true,
      rfqMessage: true,
      campaign: true,
    },
  });
}

export async function listQuotationsForRequest(requestId: string) {
  const campaigns = await db.query.rfqCampaign.findMany({
    where: (campaign, { eq }) => eq(campaign.requestId, requestId),
    with: {
      quotations: {
        with: {
          supplier: true,
          rfqMessage: true,
          campaign: true,
        },
        orderBy: (q, { desc }) => [desc(q.submittedAt)],
      },
    },
    orderBy: (campaign, { desc }) => [desc(campaign.createdAt)],
  });

  return campaigns.flatMap((campaign) => campaign.quotations);
}

export async function listQuotationsForCampaign(rfqCampaignId: string) {
  return db.query.quotation.findMany({
    where: eq(quotation.rfqCampaignId, rfqCampaignId),
    with: {
      supplier: true,
      rfqMessage: true,
      campaign: true,
    },
    orderBy: [desc(quotation.submittedAt)],
  });
}
