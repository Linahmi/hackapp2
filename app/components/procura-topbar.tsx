"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { UserButton } from "@/components/user-button"
import { CommandPalette } from "./command-palette"
import { ProcoraLogo } from "./procura-logo"

export function ProcuraTopBar({ rfqId, title }: { rfqId?: string; title?: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <>
      <header
        className="flex items-center gap-4 px-5 h-12 flex-shrink-0 border-b"
        style={{ background: "var(--p-surface)", borderColor: "var(--p-border)" }}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center flex-shrink-0 no-underline">
          <ProcoraLogo size="sm" scheme="light" />
        </Link>

        {/* Breadcrumb */}
        {rfqId && (
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: "var(--p-faint)" }}>·</span>
            <span className="font-mono text-[11px] flex-shrink-0" style={{ color: "var(--p-muted)" }}>
              {rfqId}
            </span>
            {title && (
              <>
                <span style={{ color: "var(--p-faint)" }}>·</span>
                <span className="text-[13px] truncate max-w-[260px]" style={{ color: "var(--p-ink-2)" }}>
                  {title}
                </span>
              </>
            )}
          </div>
        )}

        {/* Search — now a real button that opens the command palette */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 h-[30px] rounded-xl flex-1 max-w-[360px] overflow-hidden transition-colors text-left cursor-pointer"
          style={{
            background: "var(--p-surface-alt)",
            border: "1px solid var(--p-border)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, color: "var(--p-muted)" }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 9 L11.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-[12px] truncate" style={{ color: "var(--p-muted)" }}>
            Find a request, supplier…
          </span>
        </button>

        <div className="flex-1" />

        {/* Nav actions */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="px-3.5 py-[5px] text-[12px] font-medium rounded-lg no-underline transition-opacity hover:opacity-85"
            style={{ background: "var(--p-ink)", color: "white" }}
          >
            New request
          </Link>
        </nav>

        {/* Divider */}
        <div className="w-px h-5 flex-shrink-0" style={{ background: "var(--p-border-strong)" }} />

        <UserButton />
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
