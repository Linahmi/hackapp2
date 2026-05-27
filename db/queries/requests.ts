/**
 * ProcurementRequest query helpers.
 *
 * These are thin wrappers over Drizzle — no business logic, no side effects.
 * Business logic (status transitions, audit logging) lives in lib/services/.
 */

import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
  procurementRequest,
  type NewProcurementRequest,
  type RequestStatus,
} from "../procurement-schema";

export async function createRequest(
  data: Pick<
    NewProcurementRequest,
    "title" | "rawPrompt" | "userId" | "structuredData"
  >,
) {
  const [row] = await db
    .insert(procurementRequest)
    .values({ status: "DRAFT", ...data })
    .returning();
  if (!row) throw new Error("Failed to create procurement request");
  return row;
}

export async function getRequestById(id: string) {
  return db.query.procurementRequest.findFirst({
    where: eq(procurementRequest.id, id),
    with: {
      user: true,
      matches: {
        with: { supplier: true },
        orderBy: (m, { desc }) => [desc(m.matchScore)],
      },
      campaigns: {
        with: {
          messages: {
            with: { supplier: true },
          },
          quotations: {
            with: { supplier: true, rfqMessage: true },
            orderBy: (q, { desc }) => [desc(q.submittedAt)],
          },
        },
      },
      auditEvents: {
        orderBy: (e, { asc }) => [asc(e.createdAt)],
      },
    },
  });
}

export async function listRequestsByUser(
  userId: string,
  limit = 20,
  offset = 0,
) {
  return db.query.procurementRequest.findMany({
    where: eq(procurementRequest.userId, userId),
    orderBy: [desc(procurementRequest.createdAt)],
    limit,
    offset,
    with: {
      campaigns: { columns: { id: true, status: true, sentAt: true } },
    },
  });
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const [row] = await db
    .update(procurementRequest)
    .set({ status })
    .where(eq(procurementRequest.id, id))
    .returning();
  if (!row) throw new Error(`Request ${id} not found`);
  return row;
}

export async function updateRequestStructuredData(
  id: string,
  structuredData: Record<string, unknown>,
) {
  const [row] = await db
    .update(procurementRequest)
    .set({ structuredData })
    .where(eq(procurementRequest.id, id))
    .returning();
  if (!row) throw new Error(`Request ${id} not found`);
  return row;
}
