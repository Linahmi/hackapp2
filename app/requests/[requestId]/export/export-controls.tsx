"use client";

import Link from "next/link";
import { ArrowSquareOut, DownloadSimple, Printer } from "phosphor-react";

export function ExportControls({ compareHref }: { compareHref: string }) {
  return (
    <div className="export-controls flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85"
        style={{ background: "var(--p-accent)" }}
      >
        <DownloadSimple size={14} weight="bold" />
        Save as PDF
      </button>

      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:text-foreground"
        style={{ borderColor: "var(--p-border)", color: "var(--p-ink-2)" }}
      >
        <Printer size={14} weight="bold" />
        Print report
      </button>

      <Link
        href={compareHref}
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:text-foreground"
        style={{ borderColor: "var(--p-border)", color: "var(--p-ink-2)" }}
      >
        <ArrowSquareOut size={14} weight="bold" />
        Back to comparison
      </Link>
    </div>
  );
}
