"use client"

import { createPortal } from "react-dom"
import { useEffect, useState } from "react"

type PhaseStatus = "done" | "active" | "queued"

export type TimelinePhase = {
  id: string
  n: string
  title: string
  status: PhaseStatus
  when: string
  actor: string
  summary: string
}

function PhaseDot({ status }: { status: PhaseStatus }) {
  if (status === "done") return (
    <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--p-accent)" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5.2 L4.2 7.4 L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
  if (status === "active") return (
    <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 relative" style={{ background: "var(--p-accent-soft)", border: "1.5px solid var(--p-accent)" }}>
      <span className="absolute inset-[-4px] rounded-full" style={{ background: "var(--p-accent)", opacity: 0.18, animation: "p-pulse-ring 2s ease-out infinite" }} />
      <span className="w-[7px] h-[7px] rounded-full relative z-10" style={{ background: "var(--p-accent)" }} />
    </div>
  )
  return (
    <div className="w-[22px] h-[22px] rounded-full flex-shrink-0" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border-strong)" }} />
  )
}

export function PhaseTimeline({ phases }: { phases: TimelinePhase[] }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const doneCount = phases.filter(p => p.status === "done").length
  const activePhase = phases.find(p => p.status === "active")

  // Push page content via CSS class on <html> — transform on [data-page-root]
  useEffect(() => {
    document.documentElement.classList.toggle("timeline-open", open)
    return () => document.documentElement.classList.remove("timeline-open")
  }, [open])

  // Auto-select the active phase when it changes
  useEffect(() => {
    if (activePhase) setSelected(activePhase.id)
  }, [activePhase?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Render drawer + toggle via portal to <body> so they are unaffected
  // by any transform applied to [data-page-root]
  const portal = mounted ? createPortal(
    <>
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: 296,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          background: "var(--p-surface)",
          borderRight: "1px solid var(--p-border)",
          boxShadow: "8px 0 24px rgba(20,20,30,0.06)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--p-border)", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--p-muted)", marginBottom: 4 }}>Lifecycle</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)" }}>
              {phases.length} phases · {doneCount} complete
              {activePhase && <span style={{ color: "var(--p-accent-ink)" }}> · 1 active</span>}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-close-btn"
            style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", background: "transparent", transition: "background 120ms" }}
            aria-label="Close timeline"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Phase list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {phases.map((phase, i) => {
            const isSelected = selected === phase.id
            return (
              <div key={phase.id} style={{ display: "flex", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 10 }}>
                  <PhaseDot status={phase.status} />
                  {i < phases.length - 1 && (
                    <div style={{ width: 1, flex: 1, minHeight: 28, marginTop: 2, background: phase.status === "done" ? "var(--p-accent)" : "var(--p-border-strong)" }} />
                  )}
                </div>

                <button
                  onClick={() => setSelected(isSelected ? null : phase.id)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    paddingBottom: 12,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 8,
                    borderRadius: 5,
                    background: isSelected ? "var(--p-surface-alt)" : "transparent",
                    borderTopWidth: 0,
                    borderRightWidth: 0,
                    borderBottomWidth: 0,
                    borderLeftWidth: 2,
                    borderLeftStyle: "solid",
                    borderLeftColor: isSelected ? "var(--p-accent)" : "transparent",
                    cursor: "pointer",
                    minWidth: 0,
                    transition: "background 120ms",
                  }}
                >
                  <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2, color: "var(--p-muted)" }}>
                    {phase.n} · {phase.status === "done" ? "complete" : phase.status === "active" ? "in progress" : "queued"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: phase.status === "active" ? "var(--p-accent-ink)" : phase.status === "queued" ? "var(--p-muted)" : "var(--p-ink)" }}>
                    {phase.title}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, color: "var(--p-ink-2)" }}>
                    {phase.actor}
                    {phase.when && <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--p-muted)" }}>{" · "}{phase.when}</span>}
                  </div>
                  {isSelected && (
                    <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45, color: "var(--p-muted)" }}>
                      {phase.summary}
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Toggle tab — slides with drawer */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          left: 0,
          top: "50%",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "16px 9px",
          borderRadius: "0 6px 6px 0",
          border: "none",
          cursor: "pointer",
          transform: `translateY(-50%) translateX(${open ? 296 : 0}px)`,
          transition: "transform 220ms cubic-bezier(0.4,0,0.2,1), background 120ms",
          background: open ? "var(--p-accent)" : "var(--p-ink)",
          color: "white",
          boxShadow: "2px 2px 8px rgba(20,20,30,0.15)",
        }}
        aria-label="Toggle phase timeline"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="2" r="1.4" fill="currentColor" />
          <circle cx="6.5" cy="6.5" r="1.4" fill="currentColor" opacity="0.65" />
          <circle cx="6.5" cy="11" r="1.4" fill="currentColor" opacity="0.35" />
          <line x1="6.5" y1="3.4" x2="6.5" y2="5.1" stroke="currentColor" strokeWidth="1" />
          <line x1="6.5" y1="7.9" x2="6.5" y2="9.6" stroke="currentColor" strokeWidth="1" />
        </svg>
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          Timeline
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 5px", borderRadius: 8, lineHeight: 1, background: "rgba(255,255,255,0.2)" }}>
          {doneCount}/{phases.length}
        </span>
      </button>

      <style>{`
        .p-close-btn { color: var(--p-muted); }
        .p-close-btn:hover { background: var(--p-surface-alt) !important; color: var(--p-ink); }
      `}</style>
    </>,
    document.body
  ) : null

  return <>{portal}</>
}
