"use client"

import { useState } from "react"
import { PencilSimple } from "phosphor-react"
import { useProcurementStore } from "@/lib/stores/procurement-store"

const statusLabel: Record<string, string> = {
  idle: "Starting…",
  searching: "Searching…",
  "awaiting-selection": "Select supplier",
  analyzing: "Analyzing…",
  generating: "Generating…",
  complete: "Complete",
}

export function WorkspaceHeader({
  rfqId,
  query,
  mode,
}: {
  rfqId: string
  query: string
  mode: string
}) {
  const [title, setTitle] = useState("Request 1")
  const [editing, setEditing] = useState(false)

  const stepLabel = useProcurementStore((s) => s.stepLabel)
  const status = useProcurementStore((s) => s.status)
  const suppliersFound = useProcurementStore((s) => s.suppliersFound)
  const step = useProcurementStore((s) => s.step)

  const isProcurement = mode === "procurement"

  return (
    <div
      className="border-b flex-shrink-0"
      style={{ background: "var(--p-surface-alt)", borderColor: "var(--p-border)" }}
    >
      <div
        className="mx-auto max-w-4xl px-8 py-5 flex justify-between gap-6 flex-wrap"
      >
        {/* Left — ID · title · brief */}
        <div className="flex-1 min-w-[260px]">
          <div className="font-mono text-[11px] mb-1.5" style={{ color: "var(--p-muted)" }}>
            {rfqId}
          </div>

          {/* Editable title */}
          <div className="flex items-center gap-2 mb-2.5 group">
            {editing ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditing(false) }}
                className="font-[family-name:var(--font-sans)] text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] border-b-2 bg-transparent focus:outline-none w-full max-w-[480px]"
                style={{ color: "var(--p-ink)", borderColor: "var(--p-accent)" }}
              />
            ) : (
              <>
                <h1
                  className="font-[family-name:var(--font-sans)] text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] cursor-default"
                  style={{ color: "var(--p-ink)" }}
                  onClick={() => setEditing(true)}
                >
                  {title}
                </h1>
                <button
                  onClick={() => setEditing(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                  style={{ color: "var(--p-muted)" }}
                  aria-label="Edit title"
                >
                  <PencilSimple size={14} />
                </button>
              </>
            )}
          </div>

          {/* Brief */}
          <p
            className="text-[12px] max-w-[520px] leading-relaxed line-clamp-2"
            style={{ color: "var(--p-ink-2)" }}
          >
            {query}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--p-muted)" }}>
              {isProcurement ? "Procurement sourcing" : "AI chat"}
            </span>
          </div>
        </div>

        {/* Right — live procurement stats (procurement mode only) */}
        {isProcurement && (
          <div className="flex items-start gap-5 pt-1 flex-shrink-0">
            <Stat
              label="Step"
              value={stepLabel}
              sub={`${step + 1} of 4`}
            />
            <div className="w-px self-stretch" style={{ background: "var(--p-border)" }} />
            <Stat
              label="Status"
              value={statusLabel[status] ?? status}
              accent={status === "complete"}
            />
            {suppliersFound !== null && (
              <>
                <div className="w-px self-stretch" style={{ background: "var(--p-border)" }} />
                <Stat
                  label="Suppliers"
                  value={String(suppliersFound)}
                  sub="found"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[64px]">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.1em]"
        style={{ color: "var(--p-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] font-semibold leading-[1.2]"
        style={{ color: accent ? "var(--p-accent)" : "var(--p-ink)" }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--p-faint)" }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}
