import { auth } from "@/lib/auth";
import {
  AUDIT_EVENT_TYPES,
  logAuditEvent,
  updateRequestStatus,
  createRequest,
  upsertSupplier,
  upsertSupplierMatches,
} from "@/db/queries";
import {
  procurementSearchRequestSchema,
  runProcurementSearch,
} from "@/lib/procurement-search";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function titleFromPrompt(rawText: string): string {
  const trimmed = rawText.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = procurementSearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid procurement search request",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await runProcurementSearch(parsed.data);

    if (result.error) {
      return Response.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }

    const searchResponse = result.response!;

    // ── Persist to DB ─────────────────────────────────────────────────────────
    // Fire-and-forget: a DB write failure must never break the search response.
    // If persistence fails we log it and continue — the user still gets results.
    // _db is appended to the response so the client can reference DB IDs later
    // (e.g. when the user clicks "Send via Procora" in step 3).
    let _db:
      | { requestId: string; suppliers: Array<{ domain: string; id: string }> }
      | undefined;

    try {
      // Identify the caller — userId is nullable (anonymous requests allowed)
      const session = await auth.api.getSession({ headers: request.headers });
      const userId = session?.user?.id ?? null;

      // 1. Create the procurement request row
      const dbRequest = await createRequest({
        userId,
        title: titleFromPrompt(parsed.data.rawText),
        rawPrompt: parsed.data.rawText,
        structuredData: searchResponse.normalizedRequest as Record<
          string,
          unknown
        >,
      });

      // 2. Upsert all suppliers — keyed by domain so duplicates are merged
      const supplierRows = await Promise.all(
        searchResponse.results.map((result) =>
          upsertSupplier({
            name:
              result.companyName ||
              result.supplierName ||
              result.title ||
              result.url,
            domain: domainFromUrl(result.url),
            website: result.links?.website ?? result.url,
            email: null, // populated by user later (or from company-details fetch)
            country: null,
            // Store the full search result as metadata — nothing is lost
            metadata: result as unknown as Record<string, unknown>,
          }),
        ),
      );

      // 3. Create supplier match rows (one per result, ordered by search rank)
      await upsertSupplierMatches(
        supplierRows.map((row, i) => ({
          requestId: dbRequest.id,
          supplierId: row.id,
          matchScore: searchResponse.results[i]?.score ?? 0,
          reasoning: (searchResponse.results[i]?.metricEvidence ??
            null) as Record<string, unknown> | null,
          selected: false,
        })),
      );

      // 4. Transition request to MATCHED now that suppliers are ready
      await updateRequestStatus(dbRequest.id, "MATCHED");

      // 5. Audit event
      await logAuditEvent({
        requestId: dbRequest.id,
        type: AUDIT_EVENT_TYPES.SEARCH_COMPLETED,
        message: `Supplier search returned ${searchResponse.results.length} candidates`,
        metadata: {
          count: searchResponse.results.length,
          queryUsed: searchResponse.queryUsed,
        },
      });

      _db = {
        requestId: dbRequest.id,
        suppliers: supplierRows.map((row) => ({
          domain: row.domain,
          id: row.id,
        })),
      };
    } catch (err) {
      // DB failure is non-fatal — log and continue
      console.error("[search] DB persistence failed", err);
    }

    return Response.json({ ...searchResponse, _db });
  } catch (error) {
    console.error("Procurement supplier search failed", error);
    return Response.json({ error: "Supplier search failed" }, { status: 502 });
  }
}
