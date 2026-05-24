import { google } from "@ai-sdk/google"
import { generateText, Output } from "ai"
import { z } from "zod"
import { validateLocationCandidate } from "@/lib/procurement-location-validation"

export const procurementFieldKeys = [
  "resourceType",
  "quantity",
  "budget",
  "deliveryDate",
  "specifications",
  "location",
  "priority",
  "constraints",
] as const

export const requiredProcurementFieldKeys = procurementFieldKeys.filter(
  (field) => field !== "constraints"
)

export const procurementFieldSchema = z.enum(procurementFieldKeys)

const confidenceSchema = z
  .number()
  .min(0)
  .max(1)
  .describe("Confidence that the field was explicitly present or safely inferred from the prompt.")

const budgetSchema = z
  .object({
    amount: z.number().positive().nullable().describe("Numeric budget amount, without currency symbols."),
    currency: z.string().nullable().describe("ISO currency code or explicit currency text when present."),
    basis: z
      .enum(["total", "per_unit", "unknown"])
      .nullable()
      .describe("Whether the amount is total budget, per-unit budget, or unclear."),
    displayValue: z.string().nullable().describe("Short normalized budget label for UI display."),
  })
  .strict()

const deliveryDateSchema = z
  .object({
    text: z.string().nullable().describe("Original delivery date or timeline phrase."),
    normalized: z
      .string()
      .nullable()
      .describe("ISO date when possible, otherwise a concise normalized timeline."),
    kind: z.enum(["date", "date_range", "timeline", "unknown"]).nullable(),
  })
  .strict()

const confidenceMapSchema = z
  .object({
    resourceType: confidenceSchema,
    quantity: confidenceSchema,
    budget: confidenceSchema,
    deliveryDate: confidenceSchema,
    specifications: confidenceSchema,
    location: confidenceSchema,
    priority: confidenceSchema,
    constraints: confidenceSchema,
  })
  .strict()

const normalizedValuesSchema = z
  .object({
    resourceType: z.string().nullable(),
    quantity: z.string().nullable(),
    budget: z.string().nullable(),
    deliveryDate: z.string().nullable(),
    specifications: z.array(z.string()),
    location: z.string().nullable(),
    priority: z.string().nullable(),
    constraints: z.array(z.string()),
  })
  .strict()

const detectedFieldSchema = z
  .object({
    field: procurementFieldSchema,
    label: z.string(),
    value: z.string(),
    confidence: confidenceSchema,
  })
  .strict()

const sourceSpanSchema = z
  .object({
    field: procurementFieldSchema,
    value: z.union([z.string(), z.number()]),
    text: z.string(),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    confidence: confidenceSchema,
    country: z.string().optional(),
    region: z.string().optional(),
    validatedBy: z.literal("gazetteer").optional(),
  })
  .strict()

export const procurementRequirementExtractionSchema = z
  .object({
    resourceType: z.string().nullable(),
    quantity: z.number().int().positive().nullable(),
    budget: budgetSchema.nullable(),
    deliveryDate: deliveryDateSchema.nullable(),
    specifications: z.array(z.string()),
    location: z.string().nullable(),
    priority: z.string().nullable(),
    constraints: z.array(z.string()),
    detectedFields: z.array(detectedFieldSchema),
    sourceSpans: z.array(sourceSpanSchema),
    missingFields: z.array(procurementFieldSchema),
    confidence: confidenceMapSchema,
    normalizedValues: normalizedValuesSchema,
    completionPercentage: z.number().min(0).max(100),
    readyToSubmit: z.boolean(),
    followUpSuggestions: z.array(z.string()),
  })
  .strict()

export type ProcurementFieldKey = (typeof procurementFieldKeys)[number]
export type ProcurementRequirementExtraction = z.infer<
  typeof procurementRequirementExtractionSchema
>

const MIN_READY_CONFIDENCE = 0.55
export type ProcurementExtractionMode = "fast" | "fallback" | "verify"

const fallbackParserModelIds = [
  process.env.PROCUREMENT_FALLBACK_PARSER_MODEL,
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
].filter(Boolean) as string[]

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

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function formatNumber(value: number | null) {
  if (value === null) return null
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatBudget(budget: ProcurementRequirementExtraction["budget"]) {
  if (!budget) return null
  const displayValue = cleanString(budget.displayValue)
  if (displayValue) return displayValue

  if (budget.amount === null) return null

  const formattedAmount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(budget.amount)
  const amount = budget.currency ? `${budget.currency} ${formattedAmount}` : formattedAmount

  if (budget.basis === "per_unit") return `${amount} per unit`
  if (budget.basis === "total") return `${amount} total`
  return amount
}

function normalizeValues(
  extraction: ProcurementRequirementExtraction
): ProcurementRequirementExtraction["normalizedValues"] {
  return {
    resourceType: cleanString(extraction.normalizedValues.resourceType) ?? cleanString(extraction.resourceType),
    quantity: cleanString(extraction.normalizedValues.quantity) ?? formatNumber(extraction.quantity),
    budget: cleanString(extraction.normalizedValues.budget) ?? formatBudget(extraction.budget),
    deliveryDate:
      cleanString(extraction.normalizedValues.deliveryDate) ??
      cleanString(extraction.deliveryDate?.normalized) ??
      cleanString(extraction.deliveryDate?.text),
    specifications: cleanList(
      extraction.normalizedValues.specifications.length > 0
        ? extraction.normalizedValues.specifications
        : extraction.specifications
    ),
    location: cleanString(extraction.normalizedValues.location) ?? cleanString(extraction.location),
    priority: cleanString(extraction.normalizedValues.priority) ?? cleanString(extraction.priority),
    constraints: cleanList(
      extraction.normalizedValues.constraints.length > 0
        ? extraction.normalizedValues.constraints
        : extraction.constraints
    ),
  }
}

function hasRequiredField(
  field: ProcurementFieldKey,
  normalizedValues: ProcurementRequirementExtraction["normalizedValues"],
  confidence: ProcurementRequirementExtraction["confidence"]
) {
  if (field === "constraints") return true
  if (confidence[field] < MIN_READY_CONFIDENCE) return false

  if (field === "specifications") return normalizedValues.specifications.length > 0
  return Boolean(normalizedValues[field])
}

function buildDetectedFields(
  normalizedValues: ProcurementRequirementExtraction["normalizedValues"],
  confidence: ProcurementRequirementExtraction["confidence"]
) {
  const fields: ProcurementRequirementExtraction["detectedFields"] = []

  for (const field of procurementFieldKeys) {
    const normalizedValue = normalizedValues[field]
    const value =
      Array.isArray(normalizedValue) && normalizedValue.length > 0
        ? normalizedValue.join(", ")
        : typeof normalizedValue === "string"
          ? normalizedValue
          : null

    if (value && confidence[field] > 0) {
      fields.push({
        field,
        label: fieldLabels[field],
        value,
        confidence: confidence[field],
      })
    }
  }

  return fields
}

function normalizeSourceSpans(
  sourceSpans: ProcurementRequirementExtraction["sourceSpans"],
  sourceText?: string
) {
  return sourceSpans
    .map((span) => {
      if (!sourceText) return span

      const expectedText = sourceText.slice(span.start, span.end)

      if (expectedText === span.text) return span

      const exactStart = sourceText.indexOf(span.text)

      if (exactStart >= 0) {
        return {
          ...span,
          start: exactStart,
          end: exactStart + span.text.length,
        }
      }

      return span
    })
    .filter((span) => {
      if (span.start >= span.end) return false
      if (!sourceText) return true
      return span.end <= sourceText.length && sourceText.slice(span.start, span.end) === span.text
    })
}

function validateLocation(
  extraction: ProcurementRequirementExtraction
): ProcurementRequirementExtraction {
  const location = cleanString(extraction.location) ?? cleanString(extraction.normalizedValues.location)
  if (!location) return extraction

  const locationSpan = extraction.sourceSpans
    .filter((span) => span.field === "location")
    .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)[0]
  const validation = validateLocationCandidate(locationSpan?.text ?? location)

  if (!validation) {
    return {
      ...extraction,
      location: null,
      sourceSpans: extraction.sourceSpans.filter((span) => span.field !== "location"),
      confidence: {
        ...extraction.confidence,
        location: 0,
      },
      normalizedValues: {
        ...extraction.normalizedValues,
        location: null,
      },
    }
  }

  const combinedConfidence = Math.min(
    1,
    Math.max(extraction.confidence.location, locationSpan?.confidence ?? 0) * validation.confidence
  )

  return {
    ...extraction,
    location: validation.name,
    sourceSpans: extraction.sourceSpans.map((span) =>
      span.field === "location"
        ? {
            ...span,
            country: validation.country,
            region: validation.region,
            validatedBy: validation.validatedBy,
            value: validation.name,
            confidence: Math.min(span.confidence, combinedConfidence),
          }
        : span
    ),
    confidence: {
      ...extraction.confidence,
      location: combinedConfidence,
    },
    normalizedValues: {
      ...extraction.normalizedValues,
      location: validation.name,
    },
  }
}

function normalizeExtraction(
  extraction: ProcurementRequirementExtraction,
  sourceText?: string
): ProcurementRequirementExtraction {
  const locationValidatedExtraction = validateLocation(extraction)
  const normalizedValues = normalizeValues(locationValidatedExtraction)
  const missingFields = requiredProcurementFieldKeys.filter(
    (field) => !hasRequiredField(field, normalizedValues, locationValidatedExtraction.confidence)
  )
  const completedFields = requiredProcurementFieldKeys.length - missingFields.length
  const completionPercentage = Math.round(
    (completedFields / requiredProcurementFieldKeys.length) * 100
  )

  return {
    ...locationValidatedExtraction,
    resourceType: cleanString(locationValidatedExtraction.resourceType),
    specifications: cleanList(locationValidatedExtraction.specifications),
    location: cleanString(locationValidatedExtraction.location),
    priority: cleanString(locationValidatedExtraction.priority),
    constraints: cleanList(locationValidatedExtraction.constraints),
    sourceSpans: normalizeSourceSpans(locationValidatedExtraction.sourceSpans, sourceText),
    normalizedValues,
    detectedFields: buildDetectedFields(normalizedValues, locationValidatedExtraction.confidence),
    missingFields,
    completionPercentage,
    readyToSubmit: missingFields.length === 0,
    followUpSuggestions: missingFields.slice(0, 3).map((field) => followUpQuestions[field]),
  }
}

async function extractWithFastSlmEndpoint(
  prompt: string,
  targetFields: ProcurementFieldKey[] | undefined,
  today: string
) {
  const endpoint = process.env.PROCUREMENT_FAST_SLM_ENDPOINT
  if (!endpoint) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 900)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PROCUREMENT_FAST_SLM_API_KEY
          ? { Authorization: `Bearer ${process.env.PROCUREMENT_FAST_SLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        schema: "procurement_requirement_extraction.v1",
        prompt,
        targetFields,
        today,
        requiredFields: requiredProcurementFieldKeys,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Fast parser returned ${response.status}`)
    }

    const body = await response.json()
    return procurementRequirementExtractionSchema.parse(body)
  } finally {
    clearTimeout(timeout)
  }
}

function modelIdsForMode(mode: ProcurementExtractionMode) {
  if (mode === "fast") return []
  return fallbackParserModelIds
}

async function extractWithHostedStructuredModel({
  mode,
  prompt,
  targetFields,
  today,
}: {
  mode: ProcurementExtractionMode
  prompt: string
  targetFields?: ProcurementFieldKey[]
  today: string
}) {
  const targetFieldInstruction = targetFields?.length
    ? `Prioritize these unresolved or uncertain fields, but still return any other clearly detected fields: ${targetFields.join(", ")}.`
    : "Extract every clearly detected procurement field."
  let lastError: unknown

  for (const modelId of modelIdsForMode(mode)) {
    try {
      const { output } = await generateText({
        model: google(modelId),
        temperature: 0,
        maxRetries: 1,
        maxOutputTokens: mode === "fast" ? 900 : 1400,
        output: Output.object({
          schema: procurementRequirementExtractionSchema,
          name: "procurement_requirement_extraction",
          description:
            "Reasoning-free structured procurement slot extraction with values, source spans, confidence, and readiness.",
        }),
        system: `You are a procurement slot-filling parser. Return strict JSON only through the schema.

Use language understanding, not keyword matching. Interpret the user's procurement intent in context.
Use only the user's prompt. Do not fabricate missing information.
Set absent fields to null or [] with confidence 0.
Use confidence below ${MIN_READY_CONFIDENCE} when a field is ambiguous.
Normalize clear relative dates against ${today}; "tomorrow" should become an ISO date.
Budget examples: "40000$", "$40k", "3000 dollars" are budget, not quantity.
Quantity examples: "3000 rtx2080 computers" means quantity 3000, specifications RTX 2080, resourceType computers.
Technical specifications include CPU, GPU, RAM, storage, screen size, OS, model numbers, warranty specs, networking, capacity, or similar product requirements.
Priority/urgency includes language such as really fast, urgent, ASAP, critical, low priority, or normal priority.
Location must be a real city, country, region, or explicit delivery destination. Do not classify arbitrary capitalized words, product names, artists, brands, or model names as locations. If unsure, omit location or use confidence below ${MIN_READY_CONFIDENCE}.
Constraints are optional and include brand preferences, warranty terms, supplier region, sustainability, refurbished/new, compliance, or sourcing constraints.
Required fields for submission are resourceType, quantity, budget, deliveryDate, specifications, location, and priority. Constraints should be detected when present but are not required.
${targetFieldInstruction}
Return sourceSpans for each detected field. Each source span must use exact text copied from the user prompt and start/end character offsets relative to the prompt string. start is inclusive and end is exclusive. If you cannot identify an exact source span, omit that span.
Return no chain-of-thought, no explanations, and no fields outside the schema.`,
        prompt,
        providerOptions: {
          google: {
            structuredOutputs: true,
          },
        },
      })

      return procurementRequirementExtractionSchema.parse(output)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

export function createEmptyProcurementExtraction(): ProcurementRequirementExtraction {
  return {
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
  }
}

export async function extractProcurementRequirements(
  prompt: string,
  targetFields?: ProcurementFieldKey[],
  options: { mode?: ProcurementExtractionMode } = {}
) {
  const trimmedPrompt = prompt.trim()

  if (!trimmedPrompt) {
    return createEmptyProcurementExtraction()
  }

  const today = new Date().toISOString().slice(0, 10)
  const mode = options.mode ?? "fast"

  if (mode === "fast") {
    try {
      const fastParsed = await extractWithFastSlmEndpoint(trimmedPrompt, targetFields, today)
      if (fastParsed) return normalizeExtraction(fastParsed, trimmedPrompt)
    } catch (error) {
      console.warn("Fast procurement SLM parser failed", error)
    }

    return normalizeExtraction(createEmptyProcurementExtraction(), trimmedPrompt)
  }

  const parsed = await extractWithHostedStructuredModel({
    mode,
    prompt: trimmedPrompt,
    targetFields,
    today,
  })

  return normalizeExtraction(parsed, trimmedPrompt)
}
