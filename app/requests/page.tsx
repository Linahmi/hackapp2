"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Package } from "phosphor-react"
import { ProcuraTopBar } from "@/app/components/procura-topbar"

type RequestItem = {
  id: string
  title: string
  status: string
  createdAt: string
  sentAt: string | null
  campaignCount: number
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:             { label: "Draft",             bg: "var(--p-surface-alt)",   color: "var(--p-muted)" },
  SEARCHING:         { label: "Searching",          bg: "#dbeafe",                color: "#1e40af" },
  MATCHED:           { label: "Matched",            bg: "#dbeafe",                color: "#1e40af" },
  READY:             { label: "Ready to send",      bg: "#dbeafe",                color: "#1e40af" },
  SENT:              { label: "RFQ sent",           bg: "#dbeafe",                color: "#1e40af" },
  RFQ_SENT:          { label: "RFQ sent",           bg: "#dbeafe",                color: "#1e40af" },
  QUOTES_RECEIVED:   { label: "Quotes received",    bg: "#fef3c7",                color: "#92400e" },
  UNDER_REVIEW:      { label: "Under review",       bg: "#fef3c7",                color: "#92400e" },
  SUPPLIER_SELECTED: { label: "Pending approval",   bg: "#ede9fe",                color: "#5b21b6" },
  APPROVED:          { label: "Approved",           bg: "var(--p-accent-subtle)", color: "var(--p-accent)" },
  COMPLETED:         { label: "Completed",          bg: "var(--p-surface-alt)",   color: "var(--p-muted)" },
  CANCELLED:         { label: "Cancelled",          bg: "#fee2e2",                color: "#991b1b" },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, bg: "var(--p-surface-alt)", color: "var(--p-muted)" }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return "Today"
  if (d === 1) return "Yesterday"
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function RequestsPage() {
  const [items, setItems] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/requests")
      .then((r) => r.json())
      .then((data: { requests?: RequestItem[]; error?: string }) => {
        if (data.error) { setError(data.error); return }
        setItems(data.requests ?? [])
      })
      .catch(() => setError("Failed to load requests"))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-svh" style={{ background: "var(--p-bg)" }}>
      <ProcuraTopBar />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
            Procurement
          </p>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--p-ink)" }}>
            My requests
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--p-ink-2)" }}>
            All your procurement requests and their current status.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm" style={{ color: "var(--p-muted)" }}>Loading…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={36} style={{ color: "var(--p-faint)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--p-muted)" }}>No requests yet</p>
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-white"
              style={{ background: "var(--p-accent)" }}
            >
              Start a new request
            </Link>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/requests/${item.id}/compare`}
                className="block rounded-2xl p-5 no-underline transition-opacity hover:opacity-80"
                style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1">
                      <span className="text-[15px] font-semibold truncate" style={{ color: "var(--p-ink)" }}>
                        {item.title}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[10px]" style={{ color: "var(--p-muted)" }}>
                        {timeAgo(item.createdAt)}
                      </span>
                      {item.sentAt && (
                        <span className="font-mono text-[10px]" style={{ color: "var(--p-muted)" }}>
                          · sent {timeAgo(item.sentAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: "var(--p-muted)", flexShrink: 0, marginTop: 3 }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
