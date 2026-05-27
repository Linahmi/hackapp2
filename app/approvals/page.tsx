"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle, Clock, Scales, XCircle } from "phosphor-react"
import { ProcuraTopBar } from "@/app/components/procura-topbar"

type ApprovalItem = {
  id: string
  selectionId: string
  decision: string
  createdAt: string
  selection: {
    id: string
    justification: string
    requestId: string
    selectedAt: string
    request?: { id: string; title: string } | null
    quotation?: {
      totalPrice: string
      currency: string
      supplier?: { name: string } | null
    } | null
  }
}

function fmt(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

function DecisionModal({
  approval,
  onClose,
  onConfirm,
  submitting,
}: {
  approval: ApprovalItem
  onClose: () => void
  onConfirm: (decision: "APPROVED" | "REJECTED", comment: string) => void
  submitting: boolean
}) {
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null)
  const [comment, setComment] = useState("")

  const supplierName = approval.selection.quotation?.supplier?.name ?? "Unknown supplier"
  const price = approval.selection.quotation
    ? fmt(approval.selection.quotation.totalPrice, approval.selection.quotation.currency)
    : null

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
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
            Review selection
          </p>
          <h2 className="text-[18px] font-semibold tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>
            {supplierName}
          </h2>
          {price && (
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--p-ink-2)" }}>{price}</p>
          )}
          {approval.selection.request?.title && (
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--p-muted)" }}>
              {approval.selection.request.title}
            </p>
          )}
        </div>

        {/* Buyer's justification */}
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: "var(--p-surface-alt)", border: "1px solid var(--p-border)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--p-muted)" }}>
            Buyer's justification
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--p-ink)" }}>
            {approval.selection.justification}
          </p>
        </div>

        {/* Decision toggle */}
        <div className="flex gap-3">
          {(["APPROVED", "REJECTED"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDecision(d)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-all"
              style={{
                background: decision === d
                  ? (d === "APPROVED" ? "var(--p-accent)" : "#dc2626")
                  : "var(--p-surface-alt)",
                color: decision === d ? "white" : "var(--p-ink-2)",
                border: `2px solid ${decision === d ? (d === "APPROVED" ? "var(--p-accent)" : "#dc2626") : "var(--p-border)"}`,
              }}
            >
              {d === "APPROVED"
                ? <><CheckCircle size={15} weight="fill" /> Approve</>
                : <><XCircle size={15} weight="fill" /> Reject</>
              }
            </button>
          ))}
        </div>

        {/* Comment */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium" style={{ color: "var(--p-ink-2)" }}>
            Comment <span style={{ color: "var(--p-muted)" }}>(optional)</span>
          </label>
          <textarea
            rows={3}
            placeholder="Add a comment for the buyer…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
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
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => decision && onConfirm(decision, comment.trim())}
            disabled={!decision || submitting}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{
              background: decision === "REJECTED" ? "#dc2626" : "var(--p-accent)",
            }}
          >
            {submitting ? "Saving…" : decision === "REJECTED" ? "Reject selection" : "Submit decision"}
          </button>
          <button onClick={onClose} className="text-sm transition-opacity hover:opacity-70" style={{ color: "var(--p-muted)" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<ApprovalItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/approvals")
      if (!res.ok) throw new Error("Failed to load approvals")
      const data = (await res.json()) as { approvals: ApprovalItem[] }
      setApprovals(data.approvals ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDecision(decision: "APPROVED" | "REJECTED", comment: string) {
    if (!modalItem) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/approvals/${modalItem.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || null }),
      })
      if (!res.ok) throw new Error("Decision failed")
      setModalItem(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh" style={{ background: "var(--p-bg)" }}>
      <ProcuraTopBar />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
            Approval inbox
          </p>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--p-ink)" }}>
            Pending approvals
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--p-ink-2)" }}>
            Supplier selections waiting for your review.
          </p>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm" style={{ color: "var(--p-muted)" }}>Loading…</span>
          </div>
        )}

        {!loading && approvals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Scales size={36} style={{ color: "var(--p-faint)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--p-muted)" }}>No pending approvals</p>
            <p className="text-xs" style={{ color: "var(--p-muted)" }}>You're all caught up.</p>
          </div>
        )}

        {!loading && approvals.length > 0 && (
          <div className="flex flex-col gap-3">
            {approvals.map((item) => {
              const supplierName = item.selection.quotation?.supplier?.name ?? "Unknown supplier"
              const price = item.selection.quotation
                ? fmt(item.selection.quotation.totalPrice, item.selection.quotation.currency)
                : null

              return (
                <div
                  key={item.id}
                  className="rounded-2xl p-5 flex flex-col gap-3"
                  style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Clock size={12} style={{ color: "var(--p-muted)" }} />
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--p-muted)" }}>
                          Pending
                        </span>
                      </div>
                      <p className="text-[15px] font-semibold" style={{ color: "var(--p-ink)" }}>
                        {supplierName}
                      </p>
                      {item.selection.request?.title && (
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--p-ink-2)" }}>
                          {item.selection.request.title}
                        </p>
                      )}
                    </div>
                    {price && (
                      <span className="font-mono text-[13px] font-semibold flex-shrink-0" style={{ color: "var(--p-accent)" }}>
                        {price}
                      </span>
                    )}
                  </div>

                  <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: "var(--p-ink-2)" }}>
                    {item.selection.justification}
                  </p>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] font-mono" style={{ color: "var(--p-muted)" }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalItem(item)}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-80"
                        style={{ background: "var(--p-accent)" }}
                      >
                        Review
                      </button>
                      <a
                        href={`/requests/${item.selection.requestId}/compare`}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium transition-opacity hover:opacity-70"
                        style={{ background: "var(--p-surface-alt)", color: "var(--p-ink-2)", border: "1px solid var(--p-border)" }}
                      >
                        View quotations
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {modalItem && (
        <DecisionModal
          approval={modalItem}
          onClose={() => setModalItem(null)}
          onConfirm={handleDecision}
          submitting={submitting}
        />
      )}
    </div>
  )
}
