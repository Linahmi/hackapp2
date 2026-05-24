import type {
  ProcurementFieldKey,
  ProcurementRequirementExtraction,
} from "@/lib/procurement-extraction"

const procurementFieldKeys: ProcurementFieldKey[] = [
  "resourceType",
  "quantity",
  "budget",
  "deliveryDate",
  "specifications",
  "location",
  "priority",
  "constraints",
]

const requiredProcurementFieldKeys: ProcurementFieldKey[] = procurementFieldKeys.filter(
  (field) => field !== "constraints" && field !== "specifications" && field !== "priority"
)

const MIN_READY_CONFIDENCE = 0.55

const fieldLabels: Record<ProcurementFieldKey, string> = {
  resourceType: "Resource type",
  quantity: "Quantity",
  budget: "Budget",
  deliveryDate: "Delivery date",
  specifications: "Specs",
  location: "Location",
  priority: "Priority",
  constraints: "Constraints",
}

const followUpQuestions: Record<ProcurementFieldKey, string> = {
  resourceType: "What type of resource do you need?",
  quantity: "How many units do you need?",
  budget: "What is your budget?",
  deliveryDate: "When do you need delivery?",
  specifications: "What technical specifications are required?",
  location: "Where should delivery go?",
  priority: "How urgent is this request?",
  constraints: "Any supplier or sourcing constraints?",
}

const resourceTerms = new Map<string, string>([
  ["computer", "computers"],
  ["computers", "computers"],
  ["pc", "computers"],
  ["pcs", "computers"],
  ["desktop", "desktops"],
  ["desktops", "desktops"],
  ["laptop", "laptops"],
  ["laptops", "laptops"],
  ["notebook", "laptops"],
  ["notebooks", "laptops"],
  ["monitor", "monitors"],
  ["monitors", "monitors"],
  ["screen", "monitors"],
  ["screens", "monitors"],
  ["server", "servers"],
  ["servers", "servers"],
  ["workstation", "workstations"],
  ["workstations", "workstations"],
  ["tablet", "tablets"],
  ["tablets", "tablets"],
  ["phone", "phones"],
  ["phones", "phones"],
  ["printer", "printers"],
  ["printers", "printers"],
])

const currencyTerms = new Set([
  "usd",
  "eur",
  "gbp",
  "chf",
  "cad",
  "aud",
  "dollar",
  "dollars",
  "euro",
  "euros",
  "franc",
  "francs",
])

const budgetContextTerms = new Set([
  "budget",
  "cost",
  "price",
  "priced",
  "spend",
  "under",
  "below",
  "maximum",
  "max",
  "cap",
  "total",
])

const specTerms = new Set([
  "ram",
  "cpu",
  "gpu",
  "ssd",
  "hdd",
  "storage",
  "screen",
  "display",
  "inch",
  "inches",
  "os",
  "windows",
  "linux",
  "macos",
  "processor",
  "core",
  "cores",
  "memory",
  "resolution",
  "networking",
  "ethernet",
  "wifi",
  "battery",
])

const specUnits = ["gb", "tb", "mb", "ghz", "mhz", "inch", "inches", "core", "cores"]
const monthTerms = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
])

const timelineTerms = new Set([
  "today",
  "tomorrow",
  "asap",
  "week",
  "weeks",
  "month",
  "months",
  "quarter",
  "q1",
  "q2",
  "q3",
  "q4",
])

const priorityTerms = new Set([
  "urgent",
  "asap",
  "critical",
  "high",
  "medium",
  "normal",
  "low",
])

const locationCueTerms = new Set([
  "to",
  "in",
  "at",
  "for",
  "deliver",
  "delivered",
  "delivery",
  "ship",
  "shipping",
  "destination",
  "office",
  "site",
])

const knownLocations = new Set([
  "zurich",
  "zürich",
  "geneva",
  "basel",
  "bern",
  "lausanne",
  "london",
  "paris",
  "berlin",
  "munich",
  "madrid",
  "milan",
  "rome",
  "amsterdam",
  "brussels",
  "vienna",
  "newyork",
  "boston",
  "chicago",
  "seattle",
  "austin",
  "singapore",
])

const constraintTerms = new Set([
  "brand",
  "warranty",
  "sustainable",
  "sustainability",
  "refurbished",
  "new",
  "regional",
  "local",
  "supplier",
  "suppliers",
  "region",
  "compliance",
  "certified",
])

type Token = {
  text: string
  normalized: string
  start: number
  end: number
}

type SourceSpan = ProcurementRequirementExtraction["sourceSpans"][number]

function isDigit(char: string) {
  const code = char.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isLetter(char: string) {
  const lower = char.toLowerCase()
  const upper = char.toUpperCase()
  return lower !== upper
}

function isTokenChar(char: string) {
  return (
    isDigit(char) ||
    isLetter(char) ||
    char === "$" ||
    char === "€" ||
    char === "£" ||
    char === "¥" ||
    char === "." ||
    char === "," ||
    char === "-" ||
    char === "/"
  )
}

function normalizeToken(text: string) {
  let normalized = ""

  for (const char of text.toLowerCase()) {
    if (isDigit(char) || isLetter(char)) {
      normalized += char
    }
  }

  return normalized
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < text.length) {
    while (index < text.length && !isTokenChar(text[index])) {
      index += 1
    }

    const start = index

    while (index < text.length && isTokenChar(text[index])) {
      index += 1
    }

    if (start < index) {
      const value = text.slice(start, index)
      tokens.push({
        text: value,
        normalized: normalizeToken(value),
        start,
        end: index,
      })
    }
  }

  return tokens
}

function hasDigit(text: string) {
  for (const char of text) {
    if (isDigit(char)) return true
  }
  return false
}

function hasLetter(text: string) {
  for (const char of text) {
    if (isLetter(char)) return true
  }
  return false
}

function hasCurrencySymbol(text: string) {
  for (const char of text) {
    if (char === "$" || char === "€" || char === "£" || char === "¥") return true
  }
  return false
}

function currencySymbolText(text: string) {
  let symbol = ""

  for (const char of text) {
    if (char === "$" || char === "€" || char === "£" || char === "¥") {
      symbol += char
    }
  }

  return symbol || null
}

function parseNumber(text: string) {
  let digits = ""

  for (const char of text) {
    if (isDigit(char)) {
      digits += char
    }
  }

  return digits ? Number(digits) : null
}

function includesAny(text: string, values: Iterable<string>) {
  for (const value of values) {
    if (text.includes(value)) return true
  }
  return false
}

function tokenAt(tokens: Token[], index: number) {
  return index >= 0 && index < tokens.length ? tokens[index] : null
}

function nearbyTokens(tokens: Token[], index: number, distance: number) {
  return tokens.slice(Math.max(0, index - distance), Math.min(tokens.length, index + distance + 1))
}

function sourceTextFor(text: string, start: number, end: number) {
  let spanStart = start
  let spanEnd = end

  while (spanStart < spanEnd && text[spanStart] === " ") {
    spanStart += 1
  }

  while (spanEnd > spanStart) {
    const char = text[spanEnd - 1]

    if (char !== " " && char !== "," && char !== "." && char !== ";" && char !== ":") {
      break
    }

    spanEnd -= 1
  }

  return text.slice(spanStart, spanEnd)
}

function makeSpan(
  text: string,
  offset: number,
  field: ProcurementFieldKey,
  value: string | number,
  start: number,
  end: number,
  confidence: number
): SourceSpan | null {
  const spanText = sourceTextFor(text, start, end)
  const trimmedStart = start + text.slice(start, end).indexOf(spanText)

  if (!spanText) return null

  return {
    field,
    value,
    text: spanText,
    start: offset + trimmedStart,
    end: offset + trimmedStart + spanText.length,
    confidence,
  }
}

function isSpecToken(token: Token) {
  if (specTerms.has(token.normalized)) return true
  if (hasDigit(token.text) && includesAny(token.normalized, specUnits)) return true
  return false
}

function isMoneyToken(tokens: Token[], index: number) {
  const token = tokens[index]
  if (!hasDigit(token.text)) return false
  if (hasCurrencySymbol(token.text)) return true

  return nearbyTokens(tokens, index, 2).some(
    (nearby) =>
      currencyTerms.has(nearby.normalized) || budgetContextTerms.has(nearby.normalized)
  )
}

function budgetSpan(text: string, tokens: Token[], index: number, offset: number) {
  const token = tokens[index]
  const amount = parseNumber(token.text)
  if (amount === null) return null

  let start = token.start
  let end = token.end
  let currency = currencySymbolText(token.text)

  const previous = tokenAt(tokens, index - 1)
  const next = tokenAt(tokens, index + 1)

  if (previous && currencyTerms.has(previous.normalized)) {
    start = previous.start
    currency = previous.text.toUpperCase()
  }

  if (next && currencyTerms.has(next.normalized)) {
    end = next.end
    currency = next.text.toUpperCase()
  }

  const afterNext = tokenAt(tokens, index + 2)
  const perUnit =
    (next?.normalized === "per" && afterNext?.normalized === "unit") ||
    nearbyTokens(tokens, index, 3).some((nearby) => nearby.normalized === "unit")

  return makeSpan(
    text,
    offset,
    "budget",
    `${currency ? `${currency} ` : ""}${amount}${perUnit ? " per unit" : ""}`,
    start,
    end,
    0.88
  )
}

function dateSpan(text: string, tokens: Token[], index: number, offset: number) {
  const token = tokens[index]
  const start = token.start
  let end = token.end
  let confidence = 0.72

  if (monthTerms.has(token.normalized)) {
    const firstNext = tokenAt(tokens, index + 1)
    const secondNext = tokenAt(tokens, index + 2)

    if (firstNext && hasDigit(firstNext.text)) {
      end = firstNext.end
      confidence = 0.9
    }

    if (secondNext && hasDigit(secondNext.text)) {
      end = secondNext.end
      confidence = 0.93
    }
  }

  if (token.normalized === "next") {
    const next = tokenAt(tokens, index + 1)
    if (next && timelineTerms.has(next.normalized)) {
      end = next.end
      confidence = 0.82
    }
  }

  if (hasDigit(token.text) && timelineTerms.has(tokenAt(tokens, index + 1)?.normalized ?? "")) {
    end = tokenAt(tokens, index + 1)?.end ?? end
    confidence = 0.84
  }

  return makeSpan(text, offset, "deliveryDate", sourceTextFor(text, start, end), start, end, confidence)
}

function addUniqueSpan(spans: SourceSpan[], span: SourceSpan | null) {
  if (!span) return

  const exists = spans.some(
    (item) =>
      item.field === span.field &&
      item.start === span.start &&
      item.end === span.end &&
      item.text === span.text
  )

  if (!exists) spans.push(span)
}

export function createEmptyFastExtraction(): ProcurementRequirementExtraction {
  return recomputeProcurementCompletion(
    {
      resourceType: null,
      quantity: null,
      budget: null,
      deliveryDate: null,
      specifications: [],
      location: null,
      priority: null,
      constraints: [],
      detectedFields: [],
      sourceSpans: [],
      missingFields: [],
      confidence: {
        resourceType: 0,
        quantity: 0,
        budget: 0,
        deliveryDate: 0,
        specifications: 0,
        location: 0,
        priority: 0,
        constraints: 0,
      },
      normalizedValues: {
        resourceType: null,
        quantity: null,
        budget: null,
        deliveryDate: null,
        specifications: [],
        location: null,
        priority: null,
        constraints: [],
      },
      completionPercentage: 0,
      readyToSubmit: false,
      followUpSuggestions: [],
    },
    new Set()
  )
}

export function extractFastProcurementSlots(text: string, offset = 0) {
  const tokens = tokenize(text)
  const spans: SourceSpan[] = []

  tokens.forEach((token, index) => {
    const resourceValue = resourceTerms.get(token.normalized)

    if (resourceValue) {
      addUniqueSpan(
        spans,
        makeSpan(text, offset, "resourceType", resourceValue, token.start, token.end, 0.9)
      )
    }

    if (isMoneyToken(tokens, index)) {
      addUniqueSpan(spans, budgetSpan(text, tokens, index, offset))
    }

    if (
      hasDigit(token.text) &&
      !hasLetter(token.text) &&
      !isMoneyToken(tokens, index) &&
      !isSpecToken(token) &&
      !monthTerms.has(token.normalized) &&
      !specTerms.has(tokenAt(tokens, index - 1)?.normalized ?? "") &&
      !specTerms.has(tokenAt(tokens, index + 1)?.normalized ?? "") &&
      !monthTerms.has(tokenAt(tokens, index - 1)?.normalized ?? "") &&
      !monthTerms.has(tokenAt(tokens, index + 1)?.normalized ?? "") &&
      !timelineTerms.has(tokenAt(tokens, index + 1)?.normalized ?? "")
    ) {
      const nearby = nearbyTokens(tokens, index, 3)
      const confidence = nearby.some((item) => resourceTerms.has(item.normalized)) ? 0.86 : 0.62
      const value = parseNumber(token.text)

      if (value !== null && value > 0) {
        addUniqueSpan(
          spans,
          makeSpan(text, offset, "quantity", value, token.start, token.end, confidence)
        )
      }
    }

    if (
      monthTerms.has(token.normalized) ||
      token.normalized === "tomorrow" ||
      token.normalized === "asap" ||
      token.normalized === "next" ||
      (hasDigit(token.text) && timelineTerms.has(tokenAt(tokens, index + 1)?.normalized ?? ""))
    ) {
      addUniqueSpan(spans, dateSpan(text, tokens, index, offset))
    }

    if (isSpecToken(token)) {
      const previous = tokenAt(tokens, index - 1)
      const next = tokenAt(tokens, index + 1)
      const phraseStart = previous && hasDigit(previous.text) && !isMoneyToken(tokens, index - 1)
        ? previous.start
        : token.start
      const phraseEnd = next && specTerms.has(next.normalized) ? next.end : token.end
      addUniqueSpan(
        spans,
        makeSpan(
          text,
          offset,
          "specifications",
          sourceTextFor(text, phraseStart, phraseEnd),
          phraseStart,
          phraseEnd,
          0.82
        )
      )
    }

    if (priorityTerms.has(token.normalized)) {
      const nearby = nearbyTokens(tokens, index, 2)
      const confidence =
        token.normalized === "asap" ||
        token.normalized === "urgent" ||
        nearby.some((item) => item.normalized === "priority")
          ? 0.86
          : 0.64
      addUniqueSpan(
        spans,
        makeSpan(text, offset, "priority", token.normalized, token.start, token.end, confidence)
      )
    }

    if (
      knownLocations.has(token.normalized) ||
      (isLetter(token.text[0] ?? "") && token.text[0] === token.text[0]?.toUpperCase())
    ) {
      const previous = tokenAt(tokens, index - 1)
      const next = tokenAt(tokens, index + 1)
      const cueNearby = nearbyTokens(tokens, index, 2).some((item) =>
        locationCueTerms.has(item.normalized)
      )

      if (
        cueNearby &&
        token.normalized.length > 2 &&
        !hasDigit(token.text) &&
        !currencyTerms.has(token.normalized) &&
        !monthTerms.has(token.normalized) &&
        !resourceTerms.has(token.normalized) &&
        !specTerms.has(token.normalized) &&
        token.normalized !== "need"
      ) {
        const includeOffice = next?.normalized === "office" || next?.normalized === "site"
        const start = previous?.normalized === "new" ? previous.end : token.start
        const end = includeOffice ? next.end : token.end
        addUniqueSpan(
          spans,
          makeSpan(text, offset, "location", token.text, start, end, knownLocations.has(token.normalized) ? 0.9 : 0.72)
        )
      }
    }

    if (constraintTerms.has(token.normalized)) {
      let start = token.start
      const end = token.end
      const previous = tokenAt(tokens, index - 1)
      const twoBack = tokenAt(tokens, index - 2)

      if (token.normalized === "warranty" && previous) {
        start = twoBack && hasDigit(twoBack.text) ? twoBack.start : previous.start
      }

      addUniqueSpan(
        spans,
        makeSpan(
          text,
          offset,
          "constraints",
          sourceTextFor(text, start, end),
          start,
          end,
          0.78
        )
      )
    }
  })

  return buildExtractionFromSpans(text, spans)
}

function bestSpan(spans: SourceSpan[], field: ProcurementFieldKey) {
  return spans
    .filter((span) => span.field === field)
    .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)[0]
}

function buildDetectedFields(
  normalizedValues: ProcurementRequirementExtraction["normalizedValues"],
  confidence: ProcurementRequirementExtraction["confidence"]
) {
  const detectedFields: ProcurementRequirementExtraction["detectedFields"] = []

  for (const field of procurementFieldKeys) {
    const value = normalizedValues[field]
    const displayValue = Array.isArray(value) ? value.join(", ") : value

    if (displayValue && confidence[field] > 0) {
      detectedFields.push({
        field,
        label: fieldLabels[field],
        value: displayValue,
        confidence: confidence[field],
      })
    }
  }

  return detectedFields
}

function buildExtractionFromSpans(_text: string, spans: SourceSpan[]) {
  const extraction = createEmptyFastExtraction()
  const sortedSpans = spans
    .filter((span) => span.start < span.end)
    .sort((a, b) => a.start - b.start || b.confidence - a.confidence)
  const scalarFields = procurementFieldKeys.filter(
    (field) => field !== "specifications" && field !== "constraints"
  )
  const bestScalarSpans = new Map<ProcurementFieldKey, SourceSpan>()

  for (const field of scalarFields) {
    const span = bestSpan(sortedSpans, field)
    if (span) bestScalarSpans.set(field, span)
  }

  const sourceSpans = sortedSpans.filter((span) => {
    if (span.field === "specifications" || span.field === "constraints") return true
    return bestScalarSpans.get(span.field) === span
  }).reduce<SourceSpan[]>((accepted, span) => {
    if (
      accepted.some(
        (item) => item.field === span.field && span.start < item.end && span.end > item.start
      )
    ) {
      return accepted
    }

    accepted.push(span)
    return accepted
  }, [])

  extraction.sourceSpans = sourceSpans

  const resourceType = bestSpan(sourceSpans, "resourceType")
  const quantity = bestSpan(sourceSpans, "quantity")
  const budget = bestSpan(sourceSpans, "budget")
  const deliveryDate = bestSpan(sourceSpans, "deliveryDate")
  const location = bestSpan(sourceSpans, "location")
  const priority = bestSpan(sourceSpans, "priority")

  extraction.resourceType = resourceType?.value.toString() ?? null
  extraction.quantity =
    typeof quantity?.value === "number" ? quantity.value : parseNumber(quantity?.value.toString() ?? "")
  extraction.budget = budget
    ? {
        amount: parseNumber(budget.text),
        currency: currencyTerms.has(budget.text.toLowerCase()) ? budget.text.toUpperCase() : null,
        basis: budget.value.toString().includes("per unit") ? "per_unit" : "unknown",
        displayValue: budget.value.toString(),
      }
    : null
  extraction.deliveryDate = deliveryDate
    ? {
        text: deliveryDate.text,
        normalized: deliveryDate.text,
        kind: "timeline",
      }
    : null
  extraction.specifications = sourceSpans
    .filter((span) => span.field === "specifications")
    .map((span) => span.value.toString())
  extraction.location = location?.value.toString() ?? null
  extraction.priority = priority?.value.toString() ?? null
  extraction.constraints = sourceSpans
    .filter((span) => span.field === "constraints")
    .map((span) => span.value.toString())

  extraction.confidence = {
    resourceType: resourceType?.confidence ?? 0,
    quantity: quantity?.confidence ?? 0,
    budget: budget?.confidence ?? 0,
    deliveryDate: deliveryDate?.confidence ?? 0,
    specifications: Math.max(
      0,
      ...sourceSpans
        .filter((span) => span.field === "specifications")
        .map((span) => span.confidence)
    ),
    location: location?.confidence ?? 0,
    priority: priority?.confidence ?? 0,
    constraints: Math.max(
      0,
      ...sourceSpans
        .filter((span) => span.field === "constraints")
        .map((span) => span.confidence)
    ),
  }

  extraction.normalizedValues = {
    resourceType: extraction.resourceType,
    quantity: extraction.quantity?.toString() ?? null,
    budget: extraction.budget?.displayValue ?? null,
    deliveryDate: extraction.deliveryDate?.normalized ?? null,
    specifications: extraction.specifications,
    location: extraction.location,
    priority: extraction.priority,
    constraints: extraction.constraints,
  }
  extraction.detectedFields = buildDetectedFields(extraction.normalizedValues, extraction.confidence)

  return recomputeProcurementCompletion(extraction, new Set())
}

function hasRequiredField(
  extraction: ProcurementRequirementExtraction,
  field: ProcurementFieldKey
) {
  if (field === "constraints") return true
  if (extraction.confidence[field] < MIN_READY_CONFIDENCE) return false

  if (field === "specifications") return extraction.normalizedValues.specifications.length > 0
  return Boolean(extraction.normalizedValues[field])
}

export function recomputeProcurementCompletion(
  extraction: ProcurementRequirementExtraction,
  ignoredFields: Set<ProcurementFieldKey>
) {
  const enabledRequiredFields = requiredProcurementFieldKeys.filter(
    (field) => !ignoredFields.has(field)
  )
  const missingFields = enabledRequiredFields.filter(
    (field) => !hasRequiredField(extraction, field)
  )
  const completedRequiredFields = enabledRequiredFields.length - missingFields.length
  const completionPercentage =
    enabledRequiredFields.length === 0
      ? 100
      : Math.round((completedRequiredFields / enabledRequiredFields.length) * 100)

  return {
    ...extraction,
    missingFields,
    completionPercentage,
    readyToSubmit: missingFields.length === 0,
    followUpSuggestions: missingFields.slice(0, 3).map((field) => followUpQuestions[field]),
  }
}

export function mergeProcurementExtractions(
  base: ProcurementRequirementExtraction,
  incoming: ProcurementRequirementExtraction,
  ignoredFields: Set<ProcurementFieldKey>
) {
  const merged = structuredClone(base) as ProcurementRequirementExtraction

  for (const field of procurementFieldKeys) {
    if (field === "specifications" || field === "constraints") continue
    if (incoming.confidence[field] >= Math.max(MIN_READY_CONFIDENCE, base.confidence[field])) {
      merged[field] = incoming[field] as never
      merged.normalizedValues[field] = incoming.normalizedValues[field] as never
      merged.confidence[field] = incoming.confidence[field]
    }
  }

  for (const field of ["specifications", "constraints"] as const) {
    const values = [
      ...merged.normalizedValues[field],
      ...incoming.normalizedValues[field],
    ]
    merged[field] = [...new Set(values)] as never
    merged.normalizedValues[field] = [...new Set(values)]
    merged.confidence[field] = Math.max(merged.confidence[field], incoming.confidence[field])
  }

  const scalarFields = procurementFieldKeys.filter(
    (field) => field !== "specifications" && field !== "constraints"
  )
  let sourceSpans = merged.sourceSpans.filter(
    (span) =>
      !scalarFields.some(
        (field) =>
          field === span.field &&
          incoming.confidence[field] >= Math.max(MIN_READY_CONFIDENCE, base.confidence[field])
      )
  )

  sourceSpans = [...sourceSpans, ...incoming.sourceSpans]
  merged.sourceSpans = dedupeSpans(sourceSpans)
  merged.detectedFields = buildDetectedFields(merged.normalizedValues, merged.confidence)

  return recomputeProcurementCompletion(merged, ignoredFields)
}

function dedupeSpans(spans: SourceSpan[]) {
  const byKey = new Map<string, SourceSpan>()

  for (const span of spans) {
    const key = `${span.field}:${span.start}:${span.end}:${span.text}`
    const current = byKey.get(key)

    if (!current || span.confidence > current.confidence) {
      byKey.set(key, span)
    }
  }

  return [...byKey.values()].sort((a, b) => a.start - b.start || b.confidence - a.confidence)
}

export function offsetExtractionSpans(
  extraction: ProcurementRequirementExtraction,
  offset: number
) {
  if (offset === 0) return extraction

  return {
    ...extraction,
    sourceSpans: extraction.sourceSpans.map((span) => ({
      ...span,
      start: span.start + offset,
      end: span.end + offset,
    })),
  }
}

export function getEnabledMissingFields(
  extraction: ProcurementRequirementExtraction | null,
  ignoredFields: Set<ProcurementFieldKey>
) {
  if (!extraction) return []

  return requiredProcurementFieldKeys.filter(
    (field) => !ignoredFields.has(field) && !hasRequiredField(extraction, field)
  )
}

export function isProcurementFieldDetected(
  extraction: ProcurementRequirementExtraction | null,
  field: ProcurementFieldKey
) {
  if (!extraction) return false
  return extraction.confidence[field] > 0 && hasRequiredField(extraction, field)
}
