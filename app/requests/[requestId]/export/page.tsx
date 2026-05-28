import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/lib/auth";
import { getProcurementWorkflowExport } from "@/lib/procurement-export";

import { ExportControls } from "./export-controls";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCurrency(value: string | number, currency: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return `${value} ${currency}`;

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch {
    return `${numericValue.toFixed(2)} ${currency}`;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--p-border)", background: "var(--p-surface-alt)" }}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: "var(--p-ink)" }}>
        {value}
      </p>
    </div>
  );
}

function Section({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <section className="rounded-[28px] border p-6 print-break-inside-avoid" style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--p-ink-2)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function RequestExportPage(
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border p-8" style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}>
          <p className="mb-2 text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
            Sign in required
          </p>
          <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
            Please sign in to export this procurement workflow.
          </p>
        </div>
      </main>
    );
  }

  const { requestId } = await params;
  const result = await getProcurementWorkflowExport(requestId, session.user.id);

  if (!result.ok) {
    if (result.reason === "not_found") notFound();

    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border p-8" style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}>
          <p className="mb-2 text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
            Access denied
          </p>
          <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
            This procurement workflow belongs to another account.
          </p>
        </div>
      </main>
    );
  }

  const {
    approvals,
    auditEvents,
    procurementRequest,
    quotations,
    requestSummary,
    selectedQuotation,
    selection,
  } = result;

  const compareHref = `/requests/${procurementRequest.id}/compare`;
  const suppliersContacted = procurementRequest.campaigns.reduce(
    (count, campaign) => count + campaign.messages.length,
    0,
  );
  const sentAt = procurementRequest.campaigns
    .map((campaign) => campaign.sentAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return (
    <main className="min-h-svh px-6 py-10 print:px-0 print:py-0" style={{ background: "var(--p-bg)" }}>
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 16mm;
          }
          body {
            background: #ffffff !important;
          }
          .export-controls {
            display: none !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 print:max-w-none">
        <header className="rounded-[32px] border px-8 py-7" style={{ borderColor: "var(--p-border)", background: "linear-gradient(135deg, rgba(20,83,45,0.08), rgba(255,255,255,0.9))" }}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--p-muted)" }}>
                Procora workflow export
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em]" style={{ color: "var(--p-ink)" }}>
                {procurementRequest.title}
              </h1>
              <p className="mt-2 text-sm" style={{ color: "var(--p-ink-2)" }}>
                A printable procurement record including RFQ activity, supplier quotations, selection, approvals, and the audit trail.
              </p>
            </div>

            <ExportControls compareHref={compareHref} />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Request status" value={procurementRequest.status} />
            <Metric label="Created" value={formatDateTime(procurementRequest.createdAt)} />
            <Metric label="RFQs sent" value={sentAt ? formatDateTime(sentAt) : "Not sent yet"} />
            <Metric label="Buyer" value={procurementRequest.user?.name ?? procurementRequest.user?.email ?? "Unknown buyer"} />
          </div>
        </header>

        <Section
          title="Workflow snapshot"
          subtitle="High-level summary of the request and current outcome."
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Campaigns" value={String(procurementRequest.campaigns.length)} />
            <Metric label="Suppliers contacted" value={String(suppliersContacted)} />
            <Metric label="Quotations received" value={String(quotations.length)} />
            <Metric
              label="Selection"
              value={selectedQuotation ? `${selectedQuotation.supplierName} (${selection?.status ?? "Pending"})` : "No supplier selected yet"}
            />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
                Original request
              </p>
              <p className="rounded-2xl border px-4 py-3 text-sm leading-6" style={{ borderColor: "var(--p-border)", color: "var(--p-ink-2)", background: "var(--p-surface-alt)" }}>
                {procurementRequest.rawPrompt}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Resource type" value={requestSummary.resourceType ?? "—"} />
              <Metric label="Quantity" value={requestSummary.quantity != null ? String(requestSummary.quantity) : "—"} />
              <Metric label="Delivery date" value={requestSummary.deliveryDate ?? "—"} />
              <Metric label="Location" value={requestSummary.location ?? "—"} />
            </div>
          </div>

          {(requestSummary.specifications.length > 0 || requestSummary.constraints.length > 0) && (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
                  Specifications
                </p>
                <ul className="space-y-2 text-sm" style={{ color: "var(--p-ink-2)" }}>
                  {requestSummary.specifications.length > 0 ? requestSummary.specifications.map((item) => (
                    <li key={item} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--p-border)", background: "var(--p-surface-alt)" }}>
                      {item}
                    </li>
                  )) : <li>—</li>}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
                  Constraints
                </p>
                <ul className="space-y-2 text-sm" style={{ color: "var(--p-ink-2)" }}>
                  {requestSummary.constraints.length > 0 ? requestSummary.constraints.map((item) => (
                    <li key={item} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--p-border)", background: "var(--p-surface-alt)" }}>
                      {item}
                    </li>
                  )) : <li>—</li>}
                </ul>
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Supplier quotations"
          subtitle="Every structured supplier reply received through Procora."
        >
          {quotations.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
              No quotations have been received yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--p-border)", color: "var(--p-muted)" }}>
                    <th className="px-3 py-2 font-semibold">Supplier</th>
                    <th className="px-3 py-2 font-semibold">Unit price</th>
                    <th className="px-3 py-2 font-semibold">Total price</th>
                    <th className="px-3 py-2 font-semibold">Lead time</th>
                    <th className="px-3 py-2 font-semibold">MOQ</th>
                    <th className="px-3 py-2 font-semibold">Submitted</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((quotation) => (
                    <tr key={quotation.id} className="border-b align-top print-break-inside-avoid" style={{ borderColor: "var(--p-border)" }}>
                      <td className="px-3 py-3">
                        <div className="font-medium" style={{ color: "var(--p-ink)" }}>{quotation.supplierName}</div>
                        <div className="text-xs" style={{ color: "var(--p-muted)" }}>
                          {quotation.submittedBy}
                          {quotation.submittedRole ? `, ${quotation.submittedRole}` : ""}
                        </div>
                        {quotation.notes ? (
                          <div className="mt-2 text-xs leading-5" style={{ color: "var(--p-ink-2)" }}>
                            {quotation.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--p-ink)" }}>
                        {formatCurrency(quotation.unitPrice, quotation.currency)}
                      </td>
                      <td className="px-3 py-3 font-medium" style={{ color: "var(--p-ink)" }}>
                        {formatCurrency(quotation.totalPrice, quotation.currency)}
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--p-ink)" }}>
                        {quotation.leadTimeDays != null ? `${quotation.leadTimeDays} days` : "—"}
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--p-ink)" }}>
                        {quotation.moq != null ? quotation.moq.toLocaleString("en-GB") : "—"}
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--p-ink)" }}>
                        {formatDateTime(quotation.submittedAt)}
                      </td>
                      <td className="px-3 py-3" style={{ color: "var(--p-ink)" }}>
                        {quotation.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Selection and approvals"
          subtitle="The chosen supplier, justification, and any approval decisions recorded on the request."
        >
          {!selection ? (
            <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
              No supplier has been selected yet.
            </p>
          ) : (
            <div className="grid gap-5">
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--p-border)", background: "var(--p-surface-alt)" }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
                      {selectedQuotation?.supplierName ?? "Selected supplier"}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--p-muted)" }}>
                      Selected on {formatDateTime(selection.selectedAt)} · Status: {selection.status}
                    </p>
                  </div>
                  {selectedQuotation ? (
                    <p className="text-sm font-medium" style={{ color: "var(--p-accent)" }}>
                      {formatCurrency(selectedQuotation.totalPrice, selectedQuotation.currency)}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm leading-6" style={{ color: "var(--p-ink-2)" }}>
                  {selection.justification}
                </p>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
                  Approval decisions
                </p>
                {approvals.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
                    No approval records were created for this selection.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className="rounded-2xl border p-4 print-break-inside-avoid"
                        style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
                            {approval.approver?.name ?? approval.approver?.email ?? "Unknown approver"}
                          </p>
                          <p className="text-xs font-semibold" style={{ color: "var(--p-accent)" }}>
                            {approval.decision}
                          </p>
                        </div>
                        <p className="text-xs" style={{ color: "var(--p-muted)" }}>
                          {approval.decidedAt ? `Decided ${formatDateTime(approval.decidedAt)}` : `Requested ${formatDateTime(approval.createdAt)}`}
                        </p>
                        {approval.comment ? (
                          <p className="mt-2 text-sm leading-6" style={{ color: "var(--p-ink-2)" }}>
                            {approval.comment}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Audit trail"
          subtitle="Chronological record of the full RFQ workflow."
        >
          {auditEvents.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--p-ink-2)" }}>
              No audit events have been recorded yet.
            </p>
          ) : (
            <div className="grid gap-4">
              {auditEvents.map((event, index) => (
                <div key={event.id} className="relative rounded-2xl border p-4 print-break-inside-avoid" style={{ borderColor: "var(--p-border)", background: index % 2 === 0 ? "var(--p-surface)" : "var(--p-surface-alt)" }}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
                      {event.message}
                    </p>
                    <p className="text-xs font-mono" style={{ color: "var(--p-muted)" }}>
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--p-muted)" }}>
                    {event.type}
                  </p>
                  {event.metadata ? (
                    <pre
                      className="mt-3 overflow-x-auto rounded-xl border px-3 py-2 text-xs leading-5"
                      style={{ borderColor: "var(--p-border)", color: "var(--p-ink-2)", background: "rgba(255,255,255,0.45)" }}
                    >
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Section>

        <footer className="px-1 pb-4 text-xs print:pb-0" style={{ color: "var(--p-muted)" }}>
          Export generated {formatDateTime(new Date())} by {session.user.name ?? session.user.email ?? "Procora user"}.
          {" "}
          <Link href={compareHref} className="underline underline-offset-4">
            Return to the live comparison view
          </Link>
          .
        </footer>
      </div>
    </main>
  );
}
