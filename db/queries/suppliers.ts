/**
 * Supplier query helpers.
 *
 * The key operation here is upsertSupplier: the search pipeline discovers
 * suppliers dynamically and we want to persist them without duplicates.
 * Domain is the stable natural key — we upsert on it.
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
  supplier,
  supplierMatch,
  type NewSupplier,
  type NewSupplierMatch,
  type SupplierStatus,
} from "../procurement-schema";

/**
 * Upsert a supplier by domain.
 * Returns the existing row (with updated metadata) or a new one.
 * Safe to call repeatedly as search results come in.
 */
export async function upsertSupplier(data: Omit<NewSupplier, "id">) {
  const [row] = await db
    .insert(supplier)
    .values(data)
    .onConflictDoUpdate({
      target: supplier.domain,
      set: {
        name: data.name,
        website: data.website,
        email: data.email,
        country: data.country,
        metadata: data.metadata,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error(`Failed to upsert supplier: ${data.domain}`);
  return row;
}

export async function getSupplierById(id: string) {
  return db.query.supplier.findFirst({
    where: eq(supplier.id, id),
  });
}

export async function getSupplierByDomain(domain: string) {
  return db.query.supplier.findFirst({
    where: eq(supplier.domain, domain),
  });
}

export async function updateSupplierStatus(id: string, status: SupplierStatus) {
  const [row] = await db
    .update(supplier)
    .set({ status })
    .where(eq(supplier.id, id))
    .returning();
  if (!row) throw new Error(`Supplier ${id} not found`);
  return row;
}

export async function updateSupplierEmail(id: string, email: string) {
  const [row] = await db
    .update(supplier)
    .set({ email })
    .where(eq(supplier.id, id))
    .returning();
  if (!row) throw new Error(`Supplier ${id} not found`);
  return row;
}

// ── Supplier Matches ─────────────────────────────────────────────────────────

/**
 * Bulk-insert supplier matches for a request.
 * Uses ON CONFLICT DO NOTHING so duplicate search results are idempotent.
 */
export async function upsertSupplierMatches(
  matches: Omit<NewSupplierMatch, "id">[],
) {
  if (matches.length === 0) return [];
  return db
    .insert(supplierMatch)
    .values(matches)
    .onConflictDoNothing()
    .returning();
}

export async function getMatchesForRequest(requestId: string) {
  return db.query.supplierMatch.findMany({
    where: eq(supplierMatch.requestId, requestId),
    with: { supplier: true },
    orderBy: (m, { desc }) => [desc(m.matchScore)],
  });
}

/**
 * Mark one or more supplier matches as selected.
 * Clears all existing selections for the request first so only the
 * current selection is active (last-write-wins for UI convenience).
 */
export async function setSelectedMatches(
  requestId: string,
  selectedSupplierIds: string[],
) {
  // Deselect all for this request
  await db
    .update(supplierMatch)
    .set({ selected: false })
    .where(eq(supplierMatch.requestId, requestId));

  if (selectedSupplierIds.length === 0) return [];

  // Select the specified ones
  return db
    .update(supplierMatch)
    .set({ selected: true })
    .where(
      inArray(supplierMatch.supplierId, selectedSupplierIds),
    )
    .returning();
}
