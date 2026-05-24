import Image from "next/image"

/* ── Icon-only mark ────────────────────────────────────────────────── */
export function ProcuraLogoMark({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/procora-logo.png"
      alt="Procora"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
      priority
    />
  )
}

