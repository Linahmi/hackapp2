"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

type Item = {
  id: string
  type: "request" | "supplier"
  label: string
  meta: string
  status?: "active" | "done" | "approval"
}

type RequestRow = {
  id: string
  title: string
  status: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--p-accent)",
  done: "var(--p-faint)",
  approval: "var(--p-amber)",
}

function statusToVariant(status: string): "active" | "done" | "approval" {
  if (["APPROVED", "COMPLETED", "CANCELLED"].includes(status)) return "done"
  if (["SUPPLIER_SELECTED"].includes(status)) return "approval"
  return "active"
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<Item[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/requests")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { requests?: RequestRow[] } | null) => {
        if (!data?.requests) return
        setItems(
          data.requests.map((r) => ({
            id: r.id,
            type: "request" as const,
            label: r.title,
            meta: r.status.replace(/_/g, " ").toLowerCase(),
            status: statusToVariant(r.status),
          }))
        )
      })
      .catch(() => {})
  }, [open])

  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.meta.toLowerCase().includes(query.toLowerCase())
      )
    : items

  // Focus input when opened
  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => {
      setQuery("")
      inputRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(timeout)
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(20,20,30,0.18)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[18%] z-50 w-full max-w-[500px] overflow-hidden rounded-[8px]"
            style={{
              translateX: "-50%",
              background: "var(--p-surface)",
              border: "1px solid var(--p-border-strong)",
              boxShadow: "0 8px 32px rgba(20,20,30,0.14), 0 2px 8px rgba(20,20,30,0.08)",
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--p-border)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--p-muted)", flexShrink: 0 }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M9.5 9.5 L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a request, supplier…"
                className="flex-1 bg-transparent text-[13px] focus:outline-none"
                style={{ color: "var(--p-ink)" }}
              />
              <kbd
                className="font-mono text-[10px] px-1.5 py-0.5 rounded-[3px]"
                style={{ background: "var(--p-surface-alt)", color: "var(--p-muted)", border: "1px solid var(--p-border)" }}
              >
                esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto py-1">
              {/* Requests group */}
              {filtered.filter(i => i.type === "request").length > 0 && (
                <div>
                  <div
                    className="px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{ color: "var(--p-muted)" }}
                  >
                    Requests
                  </div>
                  {filtered.filter(i => i.type === "request").map((item) => (
                    <motion.button
                      key={item.id}
                      whileHover={{ backgroundColor: "var(--p-surface-alt)" }}
                      onClick={() => { onClose(); window.location.href = `/requests/${item.id}/compare` }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLORS[item.status ?? "done"] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: "var(--p-ink)" }}>
                          {item.label}
                        </div>
                        <div className="font-mono text-[10px] truncate" style={{ color: "var(--p-muted)" }}>
                          {item.meta}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Suppliers group */}
              {filtered.filter(i => i.type === "supplier").length > 0 && (
                <div>
                  <div
                    className="px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{ color: "var(--p-muted)" }}
                  >
                    Suppliers
                  </div>
                  {filtered.filter(i => i.type === "supplier").map((item) => (
                    <motion.button
                      key={item.id}
                      whileHover={{ backgroundColor: "var(--p-surface-alt)" }}
                      onClick={onClose}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    >
                      <div
                        className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0 text-[10px] font-semibold"
                        style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-ink)" }}
                      >
                        {item.label[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: "var(--p-ink)" }}>
                          {item.label}
                        </div>
                        <div className="font-mono text-[10px] truncate" style={{ color: "var(--p-muted)" }}>
                          {item.meta}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {filtered.length === 0 && (
                <div className="py-10 text-center text-[12px]" style={{ color: "var(--p-muted)" }}>
                  {query.trim() ? `No results for "${query}"` : "No recent requests or suppliers yet."}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center gap-3 px-4 py-2 text-[10px] font-mono"
              style={{ borderTop: "1px solid var(--p-border)", color: "var(--p-muted)" }}
            >
              <span><kbd style={{ color: "var(--p-ink-2)" }}>↑↓</kbd> navigate</span>
              <span><kbd style={{ color: "var(--p-ink-2)" }}>↵</kbd> open</span>
              <span><kbd style={{ color: "var(--p-ink-2)" }}>esc</kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
