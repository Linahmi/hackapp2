import Image from "next/image"

const LOGO_SRC = "/procora-logo.png"
const IMAGE_WIDTH = 252
const IMAGE_HEIGHT = 281
const VISIBLE_BOUNDS = {
  height: 141,
  left: 82,
  top: 60,
  width: 119,
}

type LogoSize = "sm" | "md" | "lg" | number
type LogoScheme = "light" | "dark" | "mono"

const sizeMap = {
  sm: 20,
  md: 32,
  lg: 46,
} satisfies Record<Exclude<LogoSize, number>, number>

const textColor: Record<LogoScheme, string> = {
  dark: "#FFFFFF",
  light: "#042B44",
  mono: "#1F2937",
}

function resolveSize(size: LogoSize) {
  return typeof size === "number" ? size : sizeMap[size]
}

function ProcoraLogoImage({
  priority = false,
  size,
}: {
  priority?: boolean
  size: number
}) {
  const scale = size / VISIBLE_BOUNDS.height
  const imageWidth = IMAGE_WIDTH * scale
  const imageHeight = IMAGE_HEIGHT * scale
  const visibleWidth = VISIBLE_BOUNDS.width * scale

  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 overflow-hidden"
      style={{
        height: size,
        lineHeight: 0,
        width: visibleWidth,
      }}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        width={IMAGE_WIDTH}
        height={IMAGE_HEIGHT}
        priority={priority}
        sizes={`${Math.ceil(imageWidth)}px`}
        className="object-contain"
        style={{
          height: imageHeight,
          left: -VISIBLE_BOUNDS.left * scale,
          maxWidth: "none",
          position: "absolute",
          top: -VISIBLE_BOUNDS.top * scale,
          width: imageWidth,
        }}
      />
    </span>
  )
}

export function ProcoraLogoMark({
  className = "",
  priority = false,
  size = "md",
}: {
  className?: string
  priority?: boolean
  size?: LogoSize
}) {
  const markSize = resolveSize(size)

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      aria-label="Procora"
      role="img"
      style={{ height: markSize }}
    >
      <ProcoraLogoImage priority={priority} size={markSize} />
    </span>
  )
}

export function ProcoraLogo({
  className = "",
  priority = false,
  scheme = "light",
  showTagline = false,
  showWordmark = true,
  size = "md",
}: {
  className?: string
  priority?: boolean
  scheme?: LogoScheme
  showTagline?: boolean
  showWordmark?: boolean
  size?: LogoSize
}) {
  const markSize = resolveSize(size)
  const fontSize = Math.round(markSize / 0.72)
  const gap = Math.max(1, Math.round(markSize * 0.08))
  const taglineColor =
    scheme === "dark"
      ? "rgba(255,255,255,0.50)"
      : scheme === "mono"
        ? "#6B7280"
        : "var(--p-muted)"

  if (!showWordmark) {
    return (
      <ProcoraLogoMark
        className={className}
        priority={priority}
        size={markSize}
      />
    )
  }

  return (
    <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <span
        className="inline-flex items-end"
        role="img"
        aria-label="Procora"
        style={{ gap }}
      >
        <ProcoraLogoImage priority={priority} size={markSize} />
        <span
          aria-hidden="true"
          style={{
            color: textColor[scheme],
            fontFamily: "var(--font-sans)",
            fontSize,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 0.72,
          }}
        >
          rocora
        </span>
      </span>

      {showTagline && (
        <span
          style={{
            color: taglineColor,
            fontFamily: "var(--font-mono)",
            fontSize: Math.round(markSize * 0.175),
            fontWeight: 400,
            letterSpacing: "0.155em",
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          SMART PROCUREMENT · BETTER RESULTS
        </span>
      )}
    </span>
  )
}

export const ProcoraWordmark = ProcoraLogo
export const ProcuraLogoMark = ProcoraLogoMark
export const ProcuraWordmark = ProcoraLogo
