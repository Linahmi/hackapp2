"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell } from "phosphor-react"
import { authClient } from "@/lib/auth-client"

type NotificationPayload = {
  supplierName?: string
  requestTitle?: string
  requestId?: string
  quotationId?: string
  totalPrice?: string
  currency?: string
}

type NotificationItem = {
  id: string
  type: string
  payload: NotificationPayload
  createdAt: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationBell() {
  const { data: session } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    if (!session?.user) return
    // Skip fetch when tab is hidden — saves ~5000 req/weekend for idle tabs
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = (await res.json()) as { notifications: NotificationItem[] }
      setItems(data.notifications ?? [])
    } catch {
      // silent
    }
  }, [session?.user])

  // Poll every 30 s; also refetch immediately when tab becomes visible again
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    const onVisible = () => { if (document.visibilityState === "visible") fetchNotifications() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function markAllRead() {
    // Optimistic: clear badge immediately, API call is fire-and-forget
    setItems([])
    fetch("/api/notifications", { method: "DELETE" }).catch(() => {})
  }

  function markRead(id: string, requestId?: string) {
    // Optimistic: remove from list immediately so badge refreshes instantly
    setItems((prev) => prev.filter((n) => n.id !== id))
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    }).catch(() => {})
    if (requestId) {
      window.location.href = `/search/${requestId}`
    }
  }

  if (!session?.user) return null

  const unread = items.length

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
        style={{
          color: "var(--p-muted)",
          background: open ? "var(--p-surface-alt)" : "transparent",
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell size={17} weight={unread > 0 ? "fill" : "regular"} />
        {unread > 0 && (
          <span
            className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full font-mono font-bold leading-none"
            style={{
              background: "var(--p-accent)",
              color: "white",
              fontSize: 9,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 z-50 flex flex-col rounded-2xl shadow-xl overflow-hidden"
          style={{
            width: 340,
            background: "var(--p-surface)",
            border: "1px solid var(--p-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--p-border)" }}
          >
            <span className="text-[13px] font-semibold" style={{ color: "var(--p-ink)" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--p-accent)" }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 380 }}>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={28} style={{ color: "var(--p-faint)" }} />
                <span className="text-[12px]" style={{ color: "var(--p-muted)" }}>
                  No new notifications
                </span>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id, n.payload.requestId)}
                  className="flex flex-col gap-1 px-4 py-3 text-left transition-colors border-b last:border-b-0 hover:opacity-80"
                  style={{
                    borderColor: "var(--p-border)",
                    background: "transparent",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-medium leading-snug" style={{ color: "var(--p-ink)" }}>
                      {n.payload.supplierName ?? "A supplier"} submitted a quotation
                    </span>
                    <span className="text-[10px] flex-shrink-0 mt-0.5 font-mono" style={{ color: "var(--p-muted)" }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.payload.requestTitle && (
                    <span className="text-[11px]" style={{ color: "var(--p-ink-2)" }}>
                      {n.payload.requestTitle}
                    </span>
                  )}
                  {n.payload.totalPrice && n.payload.currency && (
                    <span className="font-mono text-[11px]" style={{ color: "var(--p-accent)" }}>
                      {Number(n.payload.totalPrice).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {n.payload.currency}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
