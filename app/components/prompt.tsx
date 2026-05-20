"use client"

import type { ComponentType, ReactNode } from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  CalendarBlank,
  Cursor,
  CaretDown,
  Circle,
  CurrencyDollar,
  GearSix,
  Hash,
  Laptop,
  Lightning,
  MagicWand,
  MapPin,
  PaperPlaneTilt,
  Plus,
  Tag,
  type IconProps,
} from "phosphor-react"
import { Select } from "@base-ui/react/select"
import type {
  ProcurementFieldKey,
  ProcurementRequirementExtraction,
} from "@/lib/procurement-extraction"
import {
  createEmptyFastExtraction,
  extractFastProcurementSlots,
  getEnabledMissingFields,
  isProcurementFieldDetected,
  mergeProcurementExtractions,
  offsetExtractionSpans,
  recomputeProcurementCompletion,
} from "@/lib/procurement-fast-extraction"
import {
  procurementSearchStorageKey,
  type ProcurementSearchPayload,
} from "@/lib/procurement-search-types"

const models = [
  { name: "Gemini 2.0 Flash", id: "google" },
  { name: "Gemini 1.5 Pro", id: "google" },
] as const

type ModelName = (typeof models)[number]["name"]

const modelIcons: Record<string, string> = {
  google: "https://svgl.app/library/gemini.svg",
}

type FieldMeta = {
  Icon: ComponentType<IconProps>
  detectedClassName: string
  highlightClassName: string
  missingLabel: string
}

const fieldMeta: Record<ProcurementFieldKey, FieldMeta> = {
  quantity: {
    Icon: Hash,
    detectedClassName:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200",
    highlightClassName:
      "bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-400/20 dark:text-blue-100 dark:ring-blue-400/30",
    missingLabel: "Add quantity",
  },
  resourceType: {
    Icon: Laptop,
    detectedClassName:
      "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/25 dark:bg-purple-400/10 dark:text-purple-200",
    highlightClassName:
      "bg-purple-100 text-purple-800 ring-purple-200 dark:bg-purple-400/20 dark:text-purple-100 dark:ring-purple-400/30",
    missingLabel: "Add resource type",
  },
  budget: {
    Icon: CurrencyDollar,
    detectedClassName:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-200",
    highlightClassName:
      "bg-green-100 text-green-800 ring-green-200 dark:bg-green-400/20 dark:text-green-100 dark:ring-green-400/30",
    missingLabel: "Add budget",
  },
  deliveryDate: {
    Icon: CalendarBlank,
    detectedClassName:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-200",
    highlightClassName:
      "bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-400/20 dark:text-orange-100 dark:ring-orange-400/30",
    missingLabel: "Add delivery date",
  },
  location: {
    Icon: MapPin,
    detectedClassName:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200",
    highlightClassName:
      "bg-red-100 text-red-800 ring-red-200 dark:bg-red-400/20 dark:text-red-100 dark:ring-red-400/30",
    missingLabel: "Add location",
  },
  specifications: {
    Icon: GearSix,
    detectedClassName:
      "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-white/15 dark:bg-white/10 dark:text-white/75",
    highlightClassName:
      "bg-neutral-200 text-neutral-800 ring-neutral-300 dark:bg-white/15 dark:text-white/80 dark:ring-white/20",
    missingLabel: "Add specs",
  },
  priority: {
    Icon: Lightning,
    detectedClassName:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
    highlightClassName:
      "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/20 dark:text-amber-100 dark:ring-amber-400/30",
    missingLabel: "Add priority",
  },
  constraints: {
    Icon: Tag,
    detectedClassName:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
    highlightClassName:
      "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-400/20 dark:text-cyan-100 dark:ring-cyan-400/30",
    missingLabel: "Add constraints",
  },
}

type ParseWindow = {
  offset: number
  text: string
}

const contextWindowSize = 40

function numberFromText(value?: string | number | null) {
  if (typeof value === "number") return value
  if (!value) return null

  let numeric = ""
  let hasDecimal = false

  for (const char of value) {
    if (char >= "0" && char <= "9") {
      numeric += char
      continue
    }

    if (char === "." && !hasDecimal) {
      numeric += char
      hasDecimal = true
    }
  }

  const parsed = Number(numeric)
  return Number.isFinite(parsed) ? parsed : null
}

function bestSourceSpan(
  extraction: ProcurementRequirementExtraction,
  field: ProcurementFieldKey
) {
  return extraction.sourceSpans
    .filter((span) => span.field === field)
    .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)[0]
}

function sourceSpansFor(
  extraction: ProcurementRequirementExtraction,
  field: ProcurementFieldKey
) {
  return extraction.sourceSpans.filter((span) => span.field === field)
}

function budgetCurrency(
  budget: ProcurementRequirementExtraction["budget"],
  spanText?: string | null
) {
  if (budget?.currency) return budget.currency
  if (!spanText) return null

  for (const char of spanText) {
    if (char === "$" || char === "€" || char === "£") return char
  }

  return null
}

function isRequiredForSubmit(
  field: ProcurementFieldKey,
  ignoredFields: Set<ProcurementFieldKey>
) {
  return field !== "constraints" && !ignoredFields.has(field)
}

function buildProcurementSearchPayload(
  rawText: string,
  extraction: ProcurementRequirementExtraction,
  ignoredFields: Set<ProcurementFieldKey>,
  selectedModel: string
): ProcurementSearchPayload {
  const fields: ProcurementSearchPayload["fields"] = {}
  const resourceTypeSpan = bestSourceSpan(extraction, "resourceType")
  const quantitySpan = bestSourceSpan(extraction, "quantity")
  const budgetSpan = bestSourceSpan(extraction, "budget")
  const deliveryDateSpan = bestSourceSpan(extraction, "deliveryDate")
  const locationSpan = bestSourceSpan(extraction, "location")
  const prioritySpan = bestSourceSpan(extraction, "priority")
  const specificationSpans = sourceSpansFor(extraction, "specifications")
  const constraintSpans = sourceSpansFor(extraction, "constraints")
  const ignoredFieldList = [...ignoredFields]

  if (extraction.resourceType) {
    fields.resourceType = {
      confidence: extraction.confidence.resourceType,
      required: isRequiredForSubmit("resourceType", ignoredFields),
      spanText: resourceTypeSpan?.text ?? null,
      value: extraction.resourceType,
    }
  }

  if (extraction.quantity) {
    fields.quantity = {
      confidence: extraction.confidence.quantity,
      required: isRequiredForSubmit("quantity", ignoredFields),
      spanText: quantitySpan?.text ?? null,
      value: extraction.quantity,
    }
  }

  if (extraction.budget) {
    const amount =
      extraction.budget.amount ??
      numberFromText(budgetSpan?.value) ??
      numberFromText(budgetSpan?.text) ??
      0

    if (amount > 0) {
      fields.budget = {
        budgetType: extraction.budget.basis ?? "unknown",
        confidence: extraction.confidence.budget,
        currency: budgetCurrency(extraction.budget, budgetSpan?.text),
        required: isRequiredForSubmit("budget", ignoredFields),
        spanText: budgetSpan?.text ?? null,
        value: amount,
      }
    }
  }

  if (extraction.deliveryDate) {
    const value =
      extraction.deliveryDate.normalized ??
      extraction.deliveryDate.text ??
      extraction.normalizedValues.deliveryDate

    if (value) {
      fields.deliveryDate = {
        confidence: extraction.confidence.deliveryDate,
        required: isRequiredForSubmit("deliveryDate", ignoredFields),
        spanText: deliveryDateSpan?.text ?? null,
        value,
      }
    }
  }

  if (extraction.location) {
    fields.location = {
      confidence: extraction.confidence.location,
      required: isRequiredForSubmit("location", ignoredFields),
      spanText: locationSpan?.text ?? null,
      value: extraction.location,
    }
  }

  if (extraction.specifications.length > 0) {
    fields.specifications = {
      confidence: extraction.confidence.specifications,
      required: isRequiredForSubmit("specifications", ignoredFields),
      spanText: specificationSpans.map((span) => span.text).join(", ") || null,
      value: extraction.specifications,
    }
  }

  if (extraction.priority) {
    fields.priority = {
      confidence: extraction.confidence.priority,
      required: isRequiredForSubmit("priority", ignoredFields),
      spanText: prioritySpan?.text ?? null,
      value: extraction.priority,
    }
  }

  if (extraction.constraints.length > 0) {
    fields.constraints = {
      confidence: extraction.confidence.constraints,
      required: false,
      spanText: constraintSpans.map((span) => span.text).join(", ") || null,
      value: extraction.constraints,
    }
  }

  return {
    completionPercentage: extraction.completionPercentage,
    detectedFields: extraction.detectedFields,
    fields,
    ignoredFields: ignoredFieldList,
    missingFields: extraction.missingFields,
    normalizedValues: extraction.normalizedValues,
    rawText,
    readyToSubmit: extraction.readyToSubmit,
    searchSettings: {
      provider: "exa",
      resultCount: 8,
      searchType: "auto",
    },
    selectedModel,
  }
}

function getHighlightSpans(
  input: string,
  extraction: ProcurementRequirementExtraction | null
) {
  if (!extraction) return []

  const accepted: ProcurementRequirementExtraction["sourceSpans"] = []
  const scalarFields = new Set<ProcurementFieldKey>([
    "resourceType",
    "quantity",
    "budget",
    "deliveryDate",
    "location",
    "priority",
  ])
  const bestScalarSpans = new Map<ProcurementFieldKey, ProcurementRequirementExtraction["sourceSpans"][number]>()

  for (const field of scalarFields) {
    const best = extraction.sourceSpans
      .filter((span) => span.field === field)
      .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)[0]

    if (best) bestScalarSpans.set(field, best)
  }

  for (const span of [...extraction.sourceSpans].sort(
    (a, b) => a.start - b.start || b.confidence - a.confidence
  )) {
    if (span.start < 0 || span.end > input.length || span.start >= span.end) continue
    if (span.confidence < 0.55) continue
    if (scalarFields.has(span.field) && bestScalarSpans.get(span.field) !== span) continue
    if (input.slice(span.start, span.end) !== span.text) continue
    if (accepted.some((item) => span.start < item.end && span.end > item.start)) continue
    accepted.push(span)
  }

  return accepted
}

function renderHighlightedPromptText(
  rawText: string,
  spans: ProcurementRequirementExtraction["sourceSpans"],
  ignoredFields: Set<ProcurementFieldKey>
) {
  const nodes: ReactNode[] = []
  let cursor = 0

  spans.forEach((span) => {
    if (span.start > cursor) {
      nodes.push(rawText.slice(cursor, span.start))
    }

    const meta = fieldMeta[span.field]
    const ignored = ignoredFields.has(span.field)

    nodes.push(
      <span
        key={`${span.field}-${span.start}-${span.end}-${span.text}`}
        className={`rounded-[6px] px-0.5 -mx-0.5 ring-1 ring-inset ring-offset-0 box-decoration-clone ${
          ignored
            ? "bg-muted text-muted-foreground ring-border opacity-70"
            : meta.highlightClassName
        }`}
      >
        {rawText.slice(span.start, span.end)}
      </span>
    )

    cursor = span.end
  })

  if (cursor < rawText.length) {
    nodes.push(rawText.slice(cursor))
  }

  return nodes
}

export function AIPrompt() {
  const [rawText, setRawText] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelName>("Gemini 2.0 Flash")
  const [extraction, setExtraction] =
    useState<ProcurementRequirementExtraction | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [ignoredFields, setIgnoredFields] = useState<Set<ProcurementFieldKey>>(
    () => new Set()
  )
  const previousTextRef = useRef("")
  const extractionRef = useRef<ProcurementRequirementExtraction>(
    createEmptyFastExtraction()
  )
  const parseWindowRef = useRef<ParseWindow>({ offset: 0, text: "" })
  const lastFallbackKeyRef = useRef("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRef = useRef<{
    direction: "backward" | "forward" | "none"
    end: number
    start: number
  } | null>(null)
  const router = useRouter()
  const trimmedInput = rawText.trim()
  const currentExtraction = trimmedInput ? extraction : null
  const completionPercentage = currentExtraction?.completionPercentage ?? 0
  const canSubmit = Boolean(trimmedInput && currentExtraction?.readyToSubmit)
  const enabledMissingFields = useMemo(
    () => getEnabledMissingFields(currentExtraction, ignoredFields),
    [currentExtraction, ignoredFields]
  )
  const ignoredMissingFields = useMemo(
    () =>
      [...ignoredFields].filter(
        (field) => field !== "constraints" && !isProcurementFieldDetected(currentExtraction, field)
      ),
    [currentExtraction, ignoredFields]
  )
  const highlightSpans = useMemo(
    () => getHighlightSpans(rawText, currentExtraction),
    [rawText, currentExtraction]
  )

  const captureSelection = useCallback(() => {
    const textarea = textareaRef.current

    if (!textarea || document.activeElement !== textarea) return

    selectionRef.current = {
      direction: textarea.selectionDirection,
      end: textarea.selectionEnd,
      start: textarea.selectionStart,
    }
  }, [])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const selection = selectionRef.current

    if (!textarea || !selection || document.activeElement !== textarea) return

    const start = Math.min(selection.start, textarea.value.length)
    const end = Math.min(selection.end, textarea.value.length)
    textarea.setSelectionRange(start, end, selection.direction)
  }, [rawText, extraction, ignoredFields])

  useEffect(() => {
    const text = rawText
    const trimmed = text.trim()
    setExtractionError(null)

    if (!trimmed) {
      setExtraction(null)
      setIsExtracting(false)
      previousTextRef.current = ""
      extractionRef.current = createEmptyFastExtraction()
      parseWindowRef.current = { offset: 0, text: "" }
      lastFallbackKeyRef.current = ""
      return
    }

    const timeoutId = window.setTimeout(() => {
      const previousText = previousTextRef.current
      const isAppend = previousText.length > 0 && text.startsWith(previousText)
      const parseWindow = isAppend
        ? {
            offset: Math.max(0, previousText.length - contextWindowSize),
            text: text.slice(Math.max(0, previousText.length - contextWindowSize)),
          }
        : { offset: 0, text }
      const fastExtraction = extractFastProcurementSlots(parseWindow.text, parseWindow.offset)
      const nextExtraction = isAppend
        ? mergeProcurementExtractions(extractionRef.current, fastExtraction, ignoredFields)
        : recomputeProcurementCompletion(fastExtraction, ignoredFields)

      previousTextRef.current = text
      extractionRef.current = nextExtraction
      parseWindowRef.current = parseWindow
      captureSelection()
      setExtraction(nextExtraction)
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [rawText, ignoredFields, captureSelection])

  useEffect(() => {
    if (!trimmedInput || !currentExtraction || enabledMissingFields.length === 0) {
      setIsExtracting(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      const parseWindow = parseWindowRef.current.text
        ? parseWindowRef.current
        : { offset: 0, text: rawText }
      const fallbackKey = `${parseWindow.offset}:${parseWindow.text}:${enabledMissingFields.join(",")}`

      if (lastFallbackKeyRef.current === fallbackKey) return

      lastFallbackKeyRef.current = fallbackKey

      captureSelection()
      setIsExtracting(true)

      try {
        const response = await fetch("/api/procurement/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: parseWindow.text,
            unresolvedFields: enabledMissingFields,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("Extraction failed")
        }

        const data = offsetExtractionSpans(
          (await response.json()) as ProcurementRequirementExtraction,
          parseWindow.offset
        )

        if (controller.signal.aborted) return

        const merged = mergeProcurementExtractions(
          extractionRef.current,
          data,
          ignoredFields
        )
        extractionRef.current = merged
        captureSelection()
        setExtraction(merged)
      } catch {
        if (controller.signal.aborted) return

        setExtractionError("Requirement extraction is unavailable.")
      } finally {
        if (!controller.signal.aborted) {
          captureSelection()
          setIsExtracting(false)
        }
      }
    }, 1000)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [
    captureSelection,
    currentExtraction,
    enabledMissingFields,
    ignoredFields,
    rawText,
    trimmedInput,
  ])

  const handleSubmit = () => {
    if (!canSubmit || !currentExtraction) return

    const id = crypto.randomUUID()
    const payload = buildProcurementSearchPayload(
      rawText,
      currentExtraction,
      ignoredFields,
      selectedModel
    )

    try {
      window.sessionStorage.setItem(
        procurementSearchStorageKey(id),
        JSON.stringify(payload)
      )
    } catch {
      return
    }

    router.push(
      `/search?id=${id}&mode=procurement&q=${encodeURIComponent(trimmedInput)}`
    )
  }

  const toggleIgnoredField = (field: ProcurementFieldKey) => {
    setIgnoredFields((current) => {
      const next = new Set(current)

      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }

      return next
    })
  }

  const selectedModelData = models.find((m) => m.name === selectedModel)

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      {/* Input box */}
      <div className="rounded-2xl border border-border bg-card p-4">
        {trimmedInput && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Requirement completeness</span>
              <span>
                {isExtracting && !currentExtraction
                  ? "Checking"
                  : `${completionPercentage}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative min-h-[80px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-base leading-6 text-foreground"
          >
            {rawText
              ? renderHighlightedPromptText(rawText, highlightSpans, ignoredFields)
              : null}
          </div>
          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => {
              selectionRef.current = {
                direction: e.currentTarget.selectionDirection,
                end: e.currentTarget.selectionEnd,
                start: e.currentTarget.selectionStart,
              }
              setRawText(e.currentTarget.value)
            }}
            onSelect={(e) => {
              selectionRef.current = {
                direction: e.currentTarget.selectionDirection,
                end: e.currentTarget.selectionEnd,
                start: e.currentTarget.selectionStart,
              }
            }}
            onClick={captureSelection}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            onKeyUp={captureSelection}
            onMouseUp={captureSelection}
            placeholder="Describe your procurement need — product, quantity, budget, timeline..."
            className="relative z-10 w-full resize-none bg-transparent text-base leading-6 text-transparent caret-foreground placeholder:text-muted-foreground focus:outline-none min-h-[80px]"
            rows={2}
          />
        </div>

        {currentExtraction && (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentExtraction.detectedFields.map((chip) => {
              const meta = fieldMeta[chip.field]
              const Icon = meta.Icon
              const ignored = ignoredFields.has(chip.field)

              return (
                <button
                  type="button"
                  key={chip.field}
                  onClick={() => toggleIgnoredField(chip.field)}
                  title={`${chip.label}: ${Math.round(chip.confidence * 100)}% confidence${
                    ignored ? " · ignored" : ""
                  }`}
                  className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                    ignored
                      ? "border-border bg-muted text-muted-foreground opacity-70"
                      : meta.detectedClassName
                  }`}
                >
                  <Icon size={13} weight="bold" className="shrink-0" />
                  <span className="truncate">{chip.value}</span>
                  {ignored && <span className="text-[10px] uppercase">ignored</span>}
                </button>
              )
            })}
            {enabledMissingFields.map((field) => {
              const meta = fieldMeta[field]
              const Icon = meta.Icon

              return (
                <button
                  type="button"
                  key={field}
                  onClick={() => toggleIgnoredField(field)}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Icon size={13} weight="bold" className="shrink-0 opacity-70" />
                  <span className="truncate">{meta.missingLabel}</span>
                </button>
              )
            })}
            {ignoredMissingFields.map((field) => {
              const meta = fieldMeta[field]
              const Icon = meta.Icon

              return (
                <button
                  type="button"
                  key={field}
                  onClick={() => toggleIgnoredField(field)}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground opacity-70 transition-colors hover:opacity-100"
                >
                  <Icon size={13} weight="bold" className="shrink-0 opacity-70" />
                  <span className="truncate">{meta.missingLabel}</span>
                  <span className="text-[10px] uppercase">ignored</span>
                </button>
              )
            })}
          </div>
        )}

        {currentExtraction?.followUpSuggestions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentExtraction.followUpSuggestions.map((suggestion) => (
              <span
                key={suggestion}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {suggestion}
              </span>
            ))}
          </div>
        ) : null}

        {extractionError && (
          <p className="mt-3 text-xs text-destructive">{extractionError}</p>
        )}

        <div className="flex items-center gap-1 mt-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Add attachment"
          >
            <Plus size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="AI suggestions"
          >
            <MagicWand size={18} weight="fill" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Circle tool"
          >
            <Circle size={18} weight="duotone" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Select tool"
          >
            <Cursor size={18} weight="bold" />
          </button>

          <div className="flex-1" />

          <Select.Root
            value={selectedModel}
            onValueChange={(value) => setSelectedModel(value as ModelName)}
          >
            <Select.Trigger className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 pr-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors outline-none">
              {selectedModelData && (
                <img src={modelIcons[selectedModelData.id]} alt="" className="h-4 w-4 model-icon" />
              )}
              <Select.Value />
              <CaretDown size={12} weight="bold" className="text-muted-foreground" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={8} align="end" className="z-10">
                <Select.Popup className="min-w-[160px] rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
                  {models.map((model) => (
                    <Select.Item
                      key={model.name}
                      value={model.name}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none cursor-default transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-foreground data-[selected]:bg-accent data-[selected]:text-foreground text-muted-foreground"
                    >
                      <img src={modelIcons[model.id]} alt="" className="h-4 w-4 model-icon" />
                      <Select.ItemText>{model.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Submit"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  )
}
