import { google } from "@ai-sdk/google"
import { generateText, Output } from "ai"
import { z } from "zod"

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
const extractionModelIds = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-lite-latest",
] as const

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

function normalizeExtraction(
  extraction: ProcurementRequirementExtraction
): ProcurementRequirementExtraction {
  const normalizedValues = normalizeValues(extraction)
  const missingFields = requiredProcurementFieldKeys.filter(
    (field) => !hasRequiredField(field, normalizedValues, extraction.confidence)
  )
  const completedFields = requiredProcurementFieldKeys.length - missingFields.length
  const completionPercentage = Math.round(
    (completedFields / requiredProcurementFieldKeys.length) * 100
  )

  return {
    ...extraction,
    resourceType: cleanString(extraction.resourceType),
    specifications: cleanList(extraction.specifications),
    location: cleanString(extraction.location),
    priority: cleanString(extraction.priority),
    constraints: cleanList(extraction.constraints),
    normalizedValues,
    detectedFields: buildDetectedFields(normalizedValues, extraction.confidence),
    missingFields,
    completionPercentage,
    readyToSubmit: missingFields.length === 0,
    followUpSuggestions: missingFields.slice(0, 3).map((field) => followUpQuestions[field]),
  }
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

export async function extractProcurementRequirements(prompt: string) {
  const trimmedPrompt = prompt.trim()

  if (!trimmedPrompt) {
    return createEmptyProcurementExtraction()
  }

  const today = new Date().toISOString().slice(0, 10)
  let lastError: unknown

  for (const modelId of extractionModelIds) {
    try {
      const { output } = await generateText({
        model: google(modelId),
        temperature: 0,
        maxRetries: 1,
        maxOutputTokens: 1400,
        output: Output.object({
          schema: procurementRequirementExtractionSchema,
          name: "procurement_requirement_extraction",
          description:
            "Structured procurement requirement extraction with detected values, missing required fields, confidence, and readiness.",
        }),
        system: `You extract procurement requirements from a user's free-text request.

Return JSON that exactly matches the schema.
Use only the user's prompt. Do not fabricate missing information.
Set absent fields to null or [] with confidence 0.
Use confidence below ${MIN_READY_CONFIDENCE} when a field is ambiguous.
Normalize dates relative to ${today} when the user gives a clear relative date.
Budget can be total or per-unit. Technical specifications include RAM, CPU, storage, screen size, OS, warranty specs, networking, capacity, or similar product requirements.
Constraints are optional and include brand preferences, warranty terms, supplier region, sustainability, refurbished/new, compliance, or sourcing constraints.
Required fields for submission are resourceType, quantity, budget, deliveryDate, specifications, location, and priority. Constraints should be detected when present but are not required.`,
        prompt: trimmedPrompt,
        providerOptions: {
          google: {
            structuredOutputs: true,
          },
        },
      })

      const parsed = procurementRequirementExtractionSchema.parse(output)
      return normalizeExtraction(parsed)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}
