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
  (field) => field !== "constraints"
)

const MIN_READY_CONFIDENCE = 0.55
const FALLBACK_CONFIDENCE = 0.72

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

type SourceSpan = ProcurementRequirementExtraction["sourceSpans"][number]

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

function normalizedDisplayValue(
  extraction: ProcurementRequirementExtraction,
  field: ProcurementFieldKey
) {
  const normalizedValue = extraction.normalizedValues[field]

  if (Array.isArray(normalizedValue)) {
    return normalizedValue.length ? normalizedValue.join(", ") : null
  }

  if (normalizedValue) return normalizedValue

  if (field === "quantity") return extraction.quantity?.toLocaleString() ?? null
  if (field === "budget") return extraction.budget?.displayValue ?? null
  if (field === "deliveryDate") {
    return extraction.deliveryDate?.normalized ?? extraction.deliveryDate?.text ?? null
  }

  return extraction[field] as string | null
}

function buildDetectedFields(extraction: ProcurementRequirementExtraction) {
  const detectedFields: ProcurementRequirementExtraction["detectedFields"] = []

  for (const field of procurementFieldKeys) {
    const value = normalizedDisplayValue(extraction, field)

    if (value && extraction.confidence[field] > 0) {
      detectedFields.push({
        field,
        label: fieldLabels[field],
        value,
        confidence: extraction.confidence[field],
      })
    }
  }

  return detectedFields
}

function hasRequiredField(
  extraction: ProcurementRequirementExtraction,
  field: ProcurementFieldKey
) {
  if (field === "constraints") return true
  if (extraction.confidence[field] < MIN_READY_CONFIDENCE) return false

  if (field === "specifications") {
    return extraction.normalizedValues.specifications.length > 0
  }

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
    detectedFields: buildDetectedFields(extraction),
    missingFields,
    completionPercentage,
    readyToSubmit: missingFields.length === 0,
    followUpSuggestions: missingFields.slice(0, 3).map((field) => followUpQuestions[field]),
  }
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
    ].filter(Boolean)
    const uniqueValues = [...new Set(values)]

    merged[field] = uniqueValues as never
    merged.normalizedValues[field] = uniqueValues
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

  return recomputeProcurementCompletion(merged, ignoredFields)
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

export function getFallbackTargetFields(
  extraction: ProcurementRequirementExtraction | null,
  ignoredFields: Set<ProcurementFieldKey>
) {
  if (!extraction) return []

  const fields = requiredProcurementFieldKeys.filter((field) => {
    if (ignoredFields.has(field)) return false
    if (!hasRequiredField(extraction, field)) return true
    return extraction.confidence[field] > 0 && extraction.confidence[field] < FALLBACK_CONFIDENCE
  })

  return [...new Set(fields)]
}

export function isProcurementFieldDetected(
  extraction: ProcurementRequirementExtraction | null,
  field: ProcurementFieldKey
) {
  if (!extraction) return false
  return extraction.confidence[field] > 0 && hasRequiredField(extraction, field)
}
