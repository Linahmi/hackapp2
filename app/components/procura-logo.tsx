"use client"

/* ═══════════════════════════════════════════════════════════════════════════════
   Procora Logo System
   ───────────────────────────────────────────────────────────────────────────────

   SVG geometry (viewBox "0 0 50 54")
   ────────────────────────────────────
   The P cap-height fills the full 54-unit viewport.

   P letterform:
     • Stem: x 0→11,  y 0→54  (full cap height, rounded outer-left corners)
     • Bowl: y 0→33  (61 % of cap),  widest at x=50  (width:height ≈ 1.21)
     • Counter hole created via fillRule="evenodd" on a single compound path
       (outer P boundary + inner counter sub-path in one `d` attribute)

   Mint leaf:
     • A teardrop centred on the counter, slightly wider on the upper-right
     • Intentionally bleeds ~3 units below counter bottom and ~1 unit into
       the stem on the left → the "sprouting from the letterform" motif

   Sizing model
   ────────────
   `size` = desired cap-height in px  (NOT font-size, NOT total SVG height)

   Derived values:
     fontSize  = round(size / CAP_RATIO)   → Outfit Bold produces cap-height ≈ size
     pbIcon    = round(fontSize * DESC_RATIO)  → padding that baseline-aligns the SVG

   Alignment
   ─────────
   ProcuraWordmark uses `align-items: flex-end`.
   The icon `<span>` wrapper carries `paddingBottom = pbIcon` so the SVG's
   visual bottom lands exactly on the text baseline:
     flex-end  →  icon-bottom = container-bottom
     pbIcon    →  SVG-bottom  = container-bottom − pbIcon  =  baseline  ✓
     SVG-top   = baseline − capH  =  cap-top  ✓

   Colour palettes
   ───────────────
   scheme="light"  default / hero / primary
   scheme="dark"   on dark backgrounds (nav dark mode, dark cards)
   scheme="mono"   print, emboss, single-colour contexts
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Font metrics (Outfit Bold, empirically measured) ──────────────────────────
const CAP_RATIO  = 0.72   // cap-height  / font-size
const DESC_RATIO = 0.22   // descender   / font-size  (space below baseline)

// ── Colour palettes ────────────────────────────────────────────────────────────
type Scheme = "light" | "dark" | "mono"

const PALETTE: Record<Scheme, { shell: string; leaf: string; text: string }> = {
  light: { shell: "#042B44", leaf: "#4CC9A0", text: "#042B44" },  // shell = text: P reads as a letter, not an icon
  dark:  { shell: "#FFFFFF", leaf: "#6DDBBA", text: "#FFFFFF" },  // shell = text: same treatment on dark
  mono:  { shell: "#1F2937", leaf: "#9CA3AF", text: "#1F2937" },  // unchanged
}

// ── SVG path data ─────────────────────────────────────────────────────────────
//
//  viewBox "0 0 50 54"   cap-height = 54 units (fills full viewport)
//
//  PATH_P   —  compound path  (outer P boundary + inner counter)
//             fillRule="evenodd" punches the counter hole automatically
//
//  Outer P boundary (clockwise):
//    • M 0 54             bottom-left baseline
//    • L 0 4 Q 0 0 4 0    up left side, rounded top-left corner
//    • L 22 0             across cap top to bowl origin
//    • C 44 0 50 9 50 17  bowl top-right curve  → rightmost at (50, 17)
//    • C 50 26 44 33 22 33 bowl bottom curve    → back to (22, 33)
//    • L 11 33            bottom of bowl → stem right edge
//    • L 11 54            down stem to baseline
//    • Z
//
//  Inner counter D-shape (creates the hole):
//    • M 11 9   counter top-left  (9-unit shell at cap top)
//    • L 21 9   counter top-right start
//    • C 36 9 41 13 41 17  counter top-right curve  → rightmost at (41, 17)
//    • C 41 23 36 26 21 26  counter bottom curve   → back to (21, 26)
//    • L 11 26  counter bottom-left  (7-unit shell at bowl bottom)
//    • Z
//
const PATH_P =
  "M0 54 L0 4 Q0 0 4 0 L22 0 C44 0 50 9 50 17 C50 26 44 33 22 33 L11 33 L11 54 Z" +
  " M11 9 L21 9 C36 9 41 13 41 17 C41 23 36 26 21 26 L11 26 Z"

//  PATH_LEAF  —  teardrop/comma shape sitting inside the counter
//
//  Counter spans: x 11→41,  y 9→26  (centre ≈ x 26, y 17.5)
//
//  Scaled to 85% of original around counter centre — stays mostly within the
//  counter, barely bleeds 1 unit below (y=27) and 1 unit left (x=14).
//  Reads as a brand detail, not a decorative icon.
//
const PATH_LEAF =
  "M24 11 C31 11 35 15 34 20 C32 26 24 27 19 26 C15 23 14 19 17 14 C19 11 22 10 24 11 Z"

// ─────────────────────────────────────────────────────────────────────────────
//  Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standalone P icon mark.
 * `size` = desired display height in px (= cap-height of the glyph).
 * Width is computed proportionally from the viewBox aspect ratio.
 */
export function ProcuraLogoMark({
  size   = 32,
  scheme = "light" as Scheme,
}: {
  size?:   number
  scheme?: Scheme
}) {
  const { shell, leaf } = PALETTE[scheme]
  const h = size
  const w = Math.round(size * 50 / 54)  // preserve viewBox aspect ratio

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 50 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Procora"
    >
      <path d={PATH_P}    fill={shell} fillRule="evenodd" />
      <path d={PATH_LEAF} fill={leaf}  />
    </svg>
  )
}

/**
 * Full integrated wordmark  [P-icon] [rocora]
 *
 * `size` = desired cap-height in px.
 *
 * The P icon height is exactly `size`.
 * The "rocora" text font-size is computed so Outfit Bold's cap-height === `size`.
 * Result: both visually align at cap-top and baseline.
 */
export function ProcuraWordmark({
  size        = 40,
  showTagline = false,
  scheme      = "light" as Scheme,
  className   = "",
}: {
  size?:        number
  showTagline?: boolean
  scheme?:      Scheme
  className?:   string
}) {
  const { shell, leaf, text } = PALETTE[scheme]

  // Derived sizing
  const fontSize  = Math.round(size / CAP_RATIO)         // font-size so cap-height = `size`
  const iconH     = size                                  // icon height  = cap-height
  const iconW     = Math.round(size * 50 / 54)           // icon width   (proportional)
  const pbIcon    = Math.round(fontSize * DESC_RATIO)     // padding for baseline alignment
  const gap       = Math.max(1, Math.round(size * 0.035)) // natural kerning gap — tight like a real letterform pair

  const taglineColor =
    scheme === "dark"  ? "rgba(255,255,255,0.50)" :
    scheme === "mono"  ? "#6B7280" :
    "var(--p-muted)"

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>

      {/* ── Wordmark row ─────────────────────────────────────── */}
      {/* align-items:flex-end + paddingBottom on icon = perfect baseline alignment */}
      <div className="flex items-end" style={{ gap }}>

        {/* Icon wrapper ─────────────────────────────────────── */}
        {/* paddingBottom pushes the SVG's visual-bottom up to the text baseline */}
        <span
          style={{
            display:       "inline-flex",
            flexShrink:    0,
            paddingBottom: pbIcon,
            lineHeight:    0,
          }}
        >
          <svg
            width={iconW}
            height={iconH}
            viewBox="0 0 50 54"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path d={PATH_P}    fill={shell} fillRule="evenodd" />
            <path d={PATH_LEAF} fill={leaf}  />
          </svg>
        </span>

        {/* "rocora" ────────────────────────────────────────── */}
        {/* Live Outfit Bold so weight, hinting, and subpixel rendering */}
        {/* always match the rest of the UI automatically.             */}
        <span
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      fontSize,
            fontWeight:    700,
            letterSpacing: "-0.03em",
            lineHeight:    1,
            color:         text,
          }}
        >
          rocora
        </span>

      </div>

      {/* ── Optional tagline ─────────────────────────────────── */}
      {showTagline && (
        <span
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      Math.round(size * 0.175),
            fontWeight:    400,
            letterSpacing: "0.155em",
            textTransform: "uppercase" as const,
            color:         taglineColor,
          }}
        >
          Smart Procurement · Better Results
        </span>
      )}

    </div>
  )
}
