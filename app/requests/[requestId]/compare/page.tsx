"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, CurrencyDollar, DownloadSimple, FileText, Timer, Trophy, Warning, X } from "phosphor-react"
import { ProcuraTopBar } from "@/app/components/procura-topbar"

type Quotation = {
  id: string
  supplierId: string
  supplierName: string
  submittedBy: string
  submittedRole: string | null
  currency: string
  unitPrice: string
  totalPrice: string
  leadTimeDays: number | null
  moq: number | null
  notes: string | null
  attachmentUrl: string | null
  status: string
  submittedAt: string
  campaignId: string
}

type Selection = {
  id: string
  quotationId: string
  justification: string
  status: string
  selectedAt: string
  quotation?: { supplier?: { name?: string } } | null
} | null

type RequestInfo = { id: string; title: string; status: string } | null

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:             { label: "Draft",             bg: "var(--p-surface-alt)",   color: "var(--p-muted)" },
  SEARCHING:         { label: "Searching",          bg: "#dbeafe",                color: "#1e40af" },
  MATCHED:           { label: "Matched",            bg: "#dbeafe",                color: "#1e40af" },
  READY:             { label: "Ready to send",      bg: "#dbeafe",                color: "#1e40af" },
  SENT:              { label: "Sent",               bg: "#dbeafe",                color: "#1e40af" },
  RFQ_SENT:          { label: "RFQ sent",           bg: "#dbeafe",                color: "#1e40af" },
  QUOTES_RECEIVED:   { label: "Quotes received",    bg: "#fef3c7",                color: "#92400e" },
  UNDER_REVIEW:      { label: "Under review",       bg: "#fef3c7",                color: "#92400e" },
  SUPPLIER_SELECTED: { label: "Pending approval",   bg: "#ede9fe",                color: "#5b21b6" },
  APPROVED:          { label: "Approved",           bg: "var(--p-accent-subtle)", color: "var(--p-accent)" },
  COMPLETED:         { label: "Completed",          bg: "var(--p-surface-alt)",   color: "var(--p-muted)" },
  CANCELLED:         { label: "Cancelled",          bg: "#fee2e2",                color: "#991b1b" },
}

function fmt(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

function Badge({ children, color }: { children: React.ReactNode; color: "green" | "amber" | "blue" }) {
  const bg = color === "green" ? "var(--p-accent-subtle)" : color === "amber" ? "#fef3c7" : "#dbeafe"
  const text = color === "green" ? "var(--p-accent)" : color === "amber" ? "#92400e" : "#1e40af"
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: bg, color: text }}
    >
      {children}
    </span>
  )
}

// ─── Selection modal ──────────────────────────────────────────────────────────

function SelectionModal({
  existingSupplierName,
  onClose,
  onConfirm,
  quotation,
  submitting,
}: {
  existingSupplierName: string | null
  onClose: () => void
  onConfirm: (justification: string, force: boolean) => void
  quotation: Quotation
  submitting: boolean
}) {
  const [justification, setJustification] = useState("")
  const isReplace = !!existingSupplierName
  const tooShort = justification.trim().length < 20

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col gap-5 p-6"
        style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
              {isReplace ? "Replace selection" : "Select supplier"}
            </p>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>
              {quotation.supplierName}
            </h2>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--p-ink-2)" }}>
              {fmt(quotation.totalPrice, quotation.currency)} total
              {quotation.leadTimeDays != null ? ` · ${quotation.leadTimeDays}d lead time` : ""}
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--p-muted)" }} className="mt-1 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {isReplace && (
          <div
            className="flex items-start gap-2.5 rounded-xl px-4 py-3"
            style={{ background: "#fef3c7", border: "1px solid #fde68a" }}
          >
            <Warning size={15} weight="fill" style={{ color: "#92400e", flexShrink: 0, marginTop: 1 }} />
            <p className="text-[12px] leading-relaxed" style={{ color: "#92400e" }}>
              <strong>{existingSupplierName}</strong> is currently selected. Confirming will supersede that selection — both decisions will remain in the audit trail.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium" style={{ color: "var(--p-ink-2)" }}>
            Justification <span style={{ color: "var(--p-rose)" }}>*</span>
          </label>
          <textarea
            autoFocus
            rows={5}
            placeholder="Explain why this supplier was chosen — price competitiveness, lead time, past relationship, compliance, etc."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2"
            style={{
              background: "var(--p-surface-alt)",
              border: "1px solid var(--p-border)",
              color: "var(--p-ink)",
              lineHeight: 1.6,
              // @ts-expect-error css custom property
              "--tw-ring-color": "var(--p-accent)",
            }}
          />
          <p
            className="text-[11px]"
            style={{ color: tooShort && justification.length > 0 ? "var(--p-rose)" : "var(--p-muted)" }}
          >
            {justification.trim().length}/20 characters minimum
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onConfirm(justification.trim(), isReplace)}
            disabled={tooShort || submitting}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: isReplace ? "#b45309" : "var(--p-accent)" }}
          >
            {submitting ? "Saving…" : isReplace ? "Replace selection" : "Confirm selection"}
          </button>
          <button
            onClick={onClose}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: "var(--p-muted)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [requestInfo, setRequestInfo] = useState<RequestInfo>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<"totalPrice" | "leadTimeDays" | "submittedAt">("totalPrice")
  const [modalQuotation, setModalQuotation] = useState<Quotation | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`/api/procurement/requests/${requestId}/quotations`),
        fetch(`/api/procurement/requests/${requestId}/selection`),
      ])
      if (!qRes.ok) throw new Error("Failed to load quotations")
      const qData = (await qRes.json()) as { quotations: Quotation[]; request?: RequestInfo }
      setQuotations(qData.quotations ?? [])
      if (qData.request) setRequestInfo(qData.request)
      if (sRes.ok) {
        const sData = (await sRes.json()) as { selection: Selection }
        setSelection(sData.selection)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => { load() }, [load])

  async function handleConfirmSelection(justification: string, force: boolean) {
    if (!modalQuotation) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/procurement/requests/${requestId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId: modalQuotation.id, justification, force }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? "Selection failed")
      }
      setModalQuotation(null)
      await load()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Selection failed")
    } finally {
      setSubmitting(false)
    }
  }

  // Derive highlights — disabled when multiple currencies (comparing apples to oranges)
  const currencies = [...new Set(quotations.map((q) => q.currency))]
  const mixedCurrencies = currencies.length > 1
  const lowestTotal = !mixedCurrencies && quotations.length > 1
    ? Math.min(...quotations.map((q) => Number(q.totalPrice)))
    : null
  const fastestLead = quotations.filter((q) => q.leadTimeDays != null).length > 1
    ? Math.min(...quotations.filter((q) => q.leadTimeDays != null).map((q) => q.leadTimeDays!))
    : null

  const sorted = [...quotations].sort((a, b) => {
    if (sortBy === "totalPrice") return Number(a.totalPrice) - Number(b.totalPrice)
    if (sortBy === "leadTimeDays") {
      const aL = a.leadTimeDays ?? 9999
      const bL = b.leadTimeDays ?? 9999
      return aL - bL
    }
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  })

  const selectedQuotationId = selection?.quotationId

  // Name of the currently selected supplier (for re-select modal warning)
  const selectedSupplierName = selection
    ? (quotations.find((q) => q.id === selectedQuotationId)?.supplierName ?? null)
    : null

  return (
    <div className="min-h-svh" style={{ background: "var(--p-bg)" }}>
      <ProcuraTopBar />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Back + header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-[12px] mb-4 transition-opacity hover:opacity-70"
            style={{ color: "var(--p-muted)" }}
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
            Quotation comparison
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--p-ink)" }}>
              {requestInfo?.title ?? (quotations.length <= 1 ? "Quotation" : "Compare quotations")}
            </h1>
            {requestInfo?.status && STATUS_BADGE[requestInfo.status] && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: STATUS_BADGE[requestInfo.status].bg,
                  color: STATUS_BADGE[requestInfo.status].color,
                }}
              >
                {STATUS_BADGE[requestInfo.status].label}
              </span>
            )}
          </div>
          {quotations.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: "var(--p-ink-2)" }}>
              {quotations.length} quotation{quotations.length !== 1 ? "s" : ""} received
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={`/requests/${requestId}/export`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors hover:text-foreground"
              style={{ borderColor: "var(--p-border)", color: "var(--p-ink-2)" }}
            >
              <DownloadSimple size={13} weight="bold" />
              Export workflow
            </a>
          </div>
        </div>

        {/* Already selected banner */}
        {selection && (
          <div
            className="flex items-start gap-3 rounded-2xl px-5 py-4 mb-6"
            style={{ background: "var(--p-accent-subtle)", border: "1px solid var(--p-accent)" }}
          >
            <CheckCircle size={18} style={{ color: "var(--p-accent)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--p-accent)" }}>
                {selectedSupplierName ?? "Supplier"} selected
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--p-ink-2)" }}>
                {selection.justification}
              </p>
              <p className="text-[11px] mt-1 font-mono" style={{ color: "var(--p-muted)" }}>
                You can still replace this selection by clicking another card.
              </p>
            </div>
          </div>
        )}

        {/* Mixed currency warning */}
        {mixedCurrencies && quotations.length > 0 && (
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-5"
            style={{ background: "#fef3c7", border: "1px solid #fde68a" }}
          >
            <CurrencyDollar size={15} style={{ color: "#92400e", flexShrink: 0 }} />
            <p className="text-[12px]" style={{ color: "#92400e" }}>
              Quotations use multiple currencies ({currencies.join(", ")}) — "Best price" badge disabled. Compare manually.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm" style={{ color: "var(--p-muted)" }}>Loading quotations…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {!loading && !error && quotations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-sm" style={{ color: "var(--p-muted)" }}>No quotations received yet.</p>
          </div>
        )}

        {!loading && !error && quotations.length > 0 && (
          <>
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-[11px]" style={{ color: "var(--p-muted)" }}>Sort by:</span>
              {(["totalPrice", "leadTimeDays", "submittedAt"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    background: sortBy === key ? "var(--p-accent)" : "var(--p-surface)",
                    color: sortBy === key ? "white" : "var(--p-ink-2)",
                    border: `1px solid ${sortBy === key ? "var(--p-accent)" : "var(--p-border)"}`,
                  }}
                >
                  {key === "totalPrice" ? "Total price" : key === "leadTimeDays" ? "Lead time" : "Date"}
                </button>
              ))}
            </div>

            {/* Comparison cards */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {sorted.map((q) => {
                const isSelected = q.id === selectedQuotationId
                const isBestPrice = lowestTotal !== null && Number(q.totalPrice) === lowestTotal
                const isFastestLead = fastestLead !== null && q.leadTimeDays === fastestLead

                return (
                  <div
                    key={q.id}
                    className="rounded-2xl flex flex-col gap-4 p-5"
                    style={{
                      background: "var(--p-surface)",
                      border: `2px solid ${isSelected ? "var(--p-accent)" : "var(--p-border)"}`,
                    }}
                  >
                    {/* Supplier + badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--p-ink)" }}>
                          {q.supplierName}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--p-muted)" }}>
                          {q.submittedBy}{q.submittedRole ? ` · ${q.submittedRole}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isSelected && <Badge color="green"><CheckCircle size={10} weight="fill" /> Selected</Badge>}
                        {isBestPrice && <Badge color="amber"><Trophy size={10} weight="fill" /> Best price</Badge>}
                        {isFastestLead && <Badge color="blue"><Timer size={10} weight="fill" /> Fastest</Badge>}
                      </div>
                    </div>

                    {/* Price block */}
                    <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "var(--p-surface-alt)" }}>
                      <div className="flex justify-between text-[12px]" style={{ color: "var(--p-ink-2)" }}>
                        <span>Unit price</span>
                        <span className="font-mono font-medium" style={{ color: "var(--p-ink)" }}>
                          {fmt(q.unitPrice, q.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[12px]" style={{ color: "var(--p-ink-2)" }}>
                        <span>Total price</span>
                        <span className="font-mono font-semibold text-[13px]" style={{ color: "var(--p-accent)" }}>
                          {fmt(q.totalPrice, q.currency)}
                        </span>
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <Detail label="Lead time" value={q.leadTimeDays != null ? `${q.leadTimeDays} day${q.leadTimeDays !== 1 ? "s" : ""}` : "—"} />
                      <Detail label="MOQ" value={q.moq != null ? q.moq.toLocaleString() : "—"} />
                      <Detail label="Currency" value={q.currency} />
                      <Detail label="Submitted" value={new Date(q.submittedAt).toLocaleDateString()} />
                    </div>

                    {q.notes && (
                      <p className="text-[11px] leading-relaxed" style={{ color: "var(--p-ink-2)" }}>
                        {q.notes}
                      </p>
                    )}

                    {q.attachmentUrl && (
                      <AttachmentLink url={q.attachmentUrl} />
                    )}

                    {/* Action button */}
                    {isSelected ? (
                      <div
                        className="mt-auto w-full rounded-xl py-2.5 text-[12px] font-semibold text-center"
                        style={{ background: "var(--p-accent-subtle)", color: "var(--p-accent)" }}
                      >
                        ✓ Selected
                      </div>
                    ) : (
                      <button
                        onClick={() => { setSubmitError(null); setModalQuotation(q) }}
                        className="mt-auto w-full rounded-xl py-2.5 text-[12px] font-semibold transition-opacity hover:opacity-80"
                        style={{ background: "var(--p-ink)", color: "white" }}
                      >
                        {selection ? "Replace with this supplier" : "Select this supplier"}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {submitError && (
              <p className="mt-4 text-sm" style={{ color: "var(--p-rose)" }}>{submitError}</p>
            )}
          </>
        )}
      </main>

      {modalQuotation && (
        <SelectionModal
          quotation={modalQuotation}
          existingSupplierName={selection ? selectedSupplierName : null}
          onClose={() => setModalQuotation(null)}
          onConfirm={handleConfirmSelection}
          submitting={submitting}
        />
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.06em] mb-0.5" style={{ color: "var(--p-muted)" }}>{label}</p>
      <p className="text-[12px] font-medium" style={{ color: "var(--p-ink)" }}>{value}</p>
    </div>
  )
}

function AttachmentLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false)

  async function open() {
    setLoading(true)
    try {
      const res = await fetch(`/api/upload/presign-download?url=${encodeURIComponent(url)}`)
      const data = (await res.json()) as { downloadUrl?: string; error?: string }
      if (res.ok && data.downloadUrl) {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
      style={{ color: "var(--p-accent)" }}
    >
      <FileText size={12} />
      {loading ? "Opening…" : "View attachment"}
    </button>
  )
}
