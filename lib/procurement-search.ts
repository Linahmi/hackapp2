import Exa from "exa-js"
import { z } from "zod"

import {
  procurementFieldKeys,
  procurementFieldSchema,
  requiredProcurementFieldKeys,
} from "@/lib/procurement-extraction"

const MIN_CRITICAL_CONFIDENCE = 0.55
const DEFAULT_RESULT_COUNT = 8

const confidenceSchema = z.number().min(0).max(1)

const baseFieldSchema = {
  confidence: confidenceSchema,
  required: z.boolean(),
  spanText: z.string().nullable().optional(),
}

const textFieldSchema = z
  .object({
    ...baseFieldSchema,
    value: z.string().min(1),
  })
  .strict()

const numberFieldSchema = z
  .object({
    ...baseFieldSchema,
    value: z.number().positive(),
  })
  .strict()

const budgetFieldSchema = z
  .object({
    ...baseFieldSchema,
    budgetType: z.enum(["total", "per_unit", "unknown"]).optional(),
    currency: z.string().nullable().optional(),
    value: z.number().positive(),
  })
  .strict()

const listFieldSchema = z
  .object({
    ...baseFieldSchema,
    spanText: z.string().nullable().optional(),
    value: z.array(z.string().min(1)).min(1),
  })
  .strict()

const fieldsSchema = z
  .object({
    resourceType: textFieldSchema.optional(),
    quantity: numberFieldSchema.optional(),
    budget: budgetFieldSchema.optional(),
    deliveryDate: textFieldSchema.optional(),
    specifications: listFieldSchema.optional(),
    location: textFieldSchema.optional(),
    priority: textFieldSchema.optional(),
    constraints: listFieldSchema.optional(),
  })
  .strict()

const detectedFieldSchema = z
  .object({
    confidence: confidenceSchema,
    field: procurementFieldSchema,
    label: z.string(),
    value: z.string(),
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

const searchSettingsSchema = z
  .object({
    provider: z.literal("exa").optional(),
    resultCount: z.number().int().min(1).max(20).optional(),
    searchType: z.enum(["auto", "keyword", "neural", "hybrid", "fast"]).optional(),
  })
  .strict()

export const procurementSearchRequestSchema = z
  .object({
    completionPercentage: z.number().min(0).max(100),
    detectedFields: z.array(detectedFieldSchema),
    fields: fieldsSchema,
    ignoredFields: z.array(procurementFieldSchema),
    missingFields: z.array(procurementFieldSchema),
    normalizedValues: normalizedValuesSchema,
    rawText: z.string().trim().min(1).max(6000),
    readyToSubmit: z.boolean(),
    searchSettings: searchSettingsSchema.optional(),
    selectedModel: z.string().optional(),
  })
  .strict()

type ProcurementSearchRequest = z.infer<typeof procurementSearchRequestSchema>
type ProcurementFields = ProcurementSearchRequest["fields"]
type ProcurementFieldKey = (typeof procurementFieldKeys)[number]

export type NormalizedProcurementRequest = {
  budget?: {
    amount: number
    currency: string
    type: "total" | "per_unit" | "unknown"
  }
  constraints: string[]
  deliveryDate?: string
  ignoredFields: ProcurementFieldKey[]
  location?: string
  priority?: "low" | "medium" | "high"
  quantity?: number
  resourceType?: string
  specifications: string[]
}

export type ProcurementSupplierResult = {
  estimatedFit: number
  matchedFields: ProcurementFieldKey[]
  snippet: string
  supplierName: string
  title: string
  url: string
  warnings: string[]
}

export type ProcurementSearchResponse = {
  filtersUsed: {
    exclude: string[]
    prefer: string[]
  }
  normalizedRequest: NormalizedProcurementRequest
  queryUsed: string
  results: ProcurementSupplierResult[]
  warnings: string[]
}

type ExaResult = {
  highlights?: string[]
  score?: number
  text?: string
  title: string | null
  url: string
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)]
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function words(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function toTitleCase(value: string) {
  return words(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function normalizeCurrency(value?: string | null) {
  const normalized = value?.trim().toLowerCase()

  if (!normalized || normalized === "$" || normalized === "usd" || normalized === "dollar" || normalized === "dollars") {
    return "USD"
  }
  if (normalized === "€" || normalized === "eur" || normalized === "euro" || normalized === "euros") {
    return "EUR"
  }
  if (normalized === "£" || normalized === "gbp" || normalized === "pound" || normalized === "pounds") {
    return "GBP"
  }
  if (normalized === "chf" || normalized === "franc" || normalized === "francs") {
    return "CHF"
  }
  if (normalized === "cad") return "CAD"
  if (normalized === "aud") return "AUD"

  return normalized.toUpperCase()
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function isIsoDateString(value: string) {
  return (
    value.length === 10 &&
    value[4] === "-" &&
    value[7] === "-" &&
    Number.isInteger(Number(value.slice(0, 4))) &&
    Number.isInteger(Number(value.slice(5, 7))) &&
    Number.isInteger(Number(value.slice(8, 10)))
  )
}

function normalizeDeliveryDate(value: string, spanText?: string | null) {
  const input = normalizeText(value || spanText || "")
  const lower = input.toLowerCase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (isIsoDateString(input)) {
    const parsedIsoDate = new Date(`${input}T00:00:00`)
    return Number.isNaN(parsedIsoDate.getTime()) ||
      toIsoDate(parsedIsoDate) !== input
      ? null
      : input
  }
  if (lower === "today" || lower === "asap") return toIsoDate(today)
  if (lower === "tomorrow") return toIsoDate(addDays(today, 1))
  if (lower === "next week") return toIsoDate(addDays(today, 7))
  if (lower === "next month") return toIsoDate(addDays(today, 30))

  const parts = lower.split(/\s+/)
  const inIndex = parts.indexOf("in")
  const numberAfterIn = inIndex >= 0 ? Number(parts[inIndex + 1]) : Number.NaN
  const unitAfterNumber = inIndex >= 0 ? parts[inIndex + 2] : null

  if (Number.isFinite(numberAfterIn) && numberAfterIn > 0 && unitAfterNumber) {
    if (unitAfterNumber.startsWith("day")) return toIsoDate(addDays(today, numberAfterIn))
    if (unitAfterNumber.startsWith("week")) return toIsoDate(addDays(today, numberAfterIn * 7))
    if (unitAfterNumber.startsWith("month")) return toIsoDate(addDays(today, numberAfterIn * 30))
  }

  const parsed = new Date(input)
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed)

  return null
}

function normalizePriority(value: string) {
  const lower = value.toLowerCase()

  if (
    lower.includes("urgent") ||
    lower.includes("asap") ||
    lower.includes("critical") ||
    lower.includes("high") ||
    lower.includes("fast") ||
    lower.includes("immediate")
  ) {
    return "high" as const
  }
  if (lower.includes("low")) return "low" as const
  return "medium" as const
}

function hasRequiredField(
  fields: ProcurementFields,
  field: ProcurementFieldKey
) {
  if (field === "constraints") return true

  const value = fields[field]
  if (!value) return false

  if (field === "specifications") {
    return Array.isArray(value.value) && value.value.length > 0
  }

  return Boolean(value.value)
}

function validateReadyRequest(request: ProcurementSearchRequest) {
  // Only block if we have no idea what to search for
  if (!request.fields.resourceType?.value) {
    return "Please describe what you need — for example: '50 laptops', 'PCR reagents', 'HVAC filters'."
  }
  return null
}

function normalizeRequest(request: ProcurementSearchRequest): {
  error: string | null
  normalized: NormalizedProcurementRequest | null
} {
  const readinessError = validateReadyRequest(request)
  if (readinessError) return { error: readinessError, normalized: null }

  const fields = request.fields
  const ignoredFields = request.ignoredFields
  const normalized: NormalizedProcurementRequest = {
    constraints: ignoredFields.includes("constraints")
      ? []
      : fields.constraints?.value.map(normalizeText).filter(Boolean) ?? [],
    ignoredFields,
    specifications: ignoredFields.includes("specifications")
      ? []
      : fields.specifications?.value.map(normalizeText).filter(Boolean) ?? [],
  }

  if (fields.resourceType && !ignoredFields.includes("resourceType")) {
    normalized.resourceType = normalizeText(fields.resourceType.value).toLowerCase()
  }

  if (fields.quantity && !ignoredFields.includes("quantity")) {
    normalized.quantity = Math.trunc(fields.quantity.value)
  }

  if (fields.budget && !ignoredFields.includes("budget")) {
    const budgetType =
      fields.budget.budgetType === "per_unit" ? "per_unit" : "total"

    normalized.budget = {
      amount: Number(fields.budget.value.toFixed(2)),
      currency: normalizeCurrency(fields.budget.currency ?? fields.budget.spanText),
      type: budgetType,
    }
  }

  if (fields.deliveryDate && !ignoredFields.includes("deliveryDate")) {
    const normalizedDate = normalizeDeliveryDate(
      fields.deliveryDate.value,
      fields.deliveryDate.spanText
    )

    if (!normalizedDate) {
      return { error: "Delivery date is invalid.", normalized: null }
    }

    normalized.deliveryDate = normalizedDate
  }

  if (fields.location && !ignoredFields.includes("location")) {
    normalized.location = toTitleCase(fields.location.value)
  }

  if (fields.priority && !ignoredFields.includes("priority")) {
    normalized.priority = normalizePriority(fields.priority.value)
  }

  return { error: null, normalized }
}

function searchableSpecs(specifications: string[]) {
  return uniqueValues(
    specifications
      .flatMap((spec) => spec.split(/[,+/]/))
      .map(normalizeText)
      .filter(Boolean)
  )
}

function buildExaQuery(request: NormalizedProcurementRequest) {
  const parts = [
    "bulk supplier",
    request.quantity?.toString(),
    ...searchableSpecs(request.specifications),
    request.resourceType,
    request.location,
    request.deliveryDate ? `delivery by ${request.deliveryDate}` : null,
    request.budget
      ? `budget ${request.budget.amount} ${request.budget.currency}`
      : null,
    request.priority === "high" ? "urgent enterprise procurement" : "enterprise procurement",
    ...request.constraints,
    "B2B distributor wholesale catalog quote",
  ]

  return parts.filter(Boolean).join(" ")
}

function buildWarnings(request: NormalizedProcurementRequest) {
  const warnings: string[] = []
  const quantity = request.quantity ?? 0
  const budget = request.budget
  const unitBudget =
    budget && quantity > 0
      ? budget.type === "per_unit"
        ? budget.amount
        : budget.amount / quantity
      : null
  const resourceType = request.resourceType ?? ""

  if (
    unitBudget !== null &&
    ((resourceType.includes("computer") && unitBudget < 250) ||
      (resourceType.includes("laptop") && unitBudget < 300) ||
      (resourceType.includes("server") && unitBudget < 1000) ||
      (resourceType.includes("monitor") && unitBudget < 75))
  ) {
    warnings.push("Budget may be too low for the requested quantity and resource type.")
  }

  if (request.priority === "high" && quantity >= 100 && request.deliveryDate) {
    const daysUntilDelivery =
      (new Date(`${request.deliveryDate}T00:00:00Z`).getTime() -
        new Date().setHours(0, 0, 0, 0)) /
      86_400_000

    if (daysUntilDelivery <= 2) {
      warnings.push("The requested delivery window may be difficult for a bulk order.")
    }
  }

  return warnings
}

function resultSnippet(result: ExaResult) {
  const text = result.highlights?.[0] ?? result.text ?? ""
  const cleaned = normalizeText(text)
  if (cleaned.length <= 260) return cleaned
  return `${cleaned.slice(0, 257)}...`
}

function supplierNameFromResult(result: ExaResult) {
  try {
    const hostname = new URL(result.url).hostname.replace(/^www\./, "")
    const domainName = hostname.split(".")[0]
    return result.title?.split(/[|–-]/)[0]?.trim() || toTitleCase(domainName)
  } catch {
    return result.title?.trim() || "Unknown supplier"
  }
}

function textMatches(haystack: string, needle: string) {
  const normalizedHaystack = haystack.toLowerCase()
  return words(needle).some((word) => word.length > 1 && normalizedHaystack.includes(word))
}

function scoreResult(
  result: ExaResult,
  request: NormalizedProcurementRequest,
  requestWarnings: string[]
): ProcurementSupplierResult {
  const content = `${result.title ?? ""} ${result.url} ${resultSnippet(result)} ${result.text ?? ""}`.toLowerCase()
  const matchedFields: ProcurementFieldKey[] = []
  let score = Math.min(0.35, Math.max(0, result.score ?? 0.2))

  if (request.resourceType && textMatches(content, request.resourceType)) {
    matchedFields.push("resourceType")
    score += 0.15
  }

  if (request.specifications.length > 0 && request.specifications.some((spec) => textMatches(content, spec))) {
    matchedFields.push("specifications")
    score += 0.15
  }

  if (request.location && textMatches(content, request.location)) {
    matchedFields.push("location")
    score += 0.1
  }

  if (request.quantity && content.includes(request.quantity.toString())) {
    matchedFields.push("quantity")
    score += 0.05
  }

  if (request.deliveryDate && content.includes(request.deliveryDate)) {
    matchedFields.push("deliveryDate")
    score += 0.05
  }

  if (request.budget && content.includes(request.budget.currency.toLowerCase())) {
    matchedFields.push("budget")
    score += 0.04
  }

  if (
    ["supplier", "distributor", "wholesale", "enterprise", "procurement", "catalog", "quote"].some(
      (term) => content.includes(term)
    )
  ) {
    score += 0.16
  }

  const warnings = [...requestWarnings]
  if (request.location && !matchedFields.includes("location")) {
    warnings.push("Location fit is not explicit in the result preview.")
  }
  if (request.specifications.length > 0 && !matchedFields.includes("specifications")) {
    warnings.push("Technical specification match is weak in the result preview.")
  }

  return {
    estimatedFit: Number(Math.min(0.99, Math.max(0.05, score)).toFixed(2)),
    matchedFields: uniqueValues(matchedFields),
    snippet: resultSnippet(result),
    supplierName: supplierNameFromResult(result),
    title: result.title?.trim() || supplierNameFromResult(result),
    url: result.url,
    warnings: uniqueValues(warnings),
  }
}

export async function runProcurementSearch(
  request: ProcurementSearchRequest
): Promise<{ response?: ProcurementSearchResponse; status?: number; error?: string }> {
  const { error, normalized } = normalizeRequest(request)

  if (error || !normalized) {
    return { error: error ?? "Invalid procurement request.", status: 422 }
  }

  const apiKey = process.env.EXA_API_KEY

  if (!apiKey) {
    return { error: "Supplier search is not configured.", status: 503 }
  }

  const exa = new Exa(apiKey)
  const query = buildExaQuery(normalized)
  const warnings = buildWarnings(normalized)
  const resultCount = request.searchSettings?.resultCount ?? DEFAULT_RESULT_COUNT
  const searchType = request.searchSettings?.searchType ?? "auto"

  const exaResponse = await exa.search(query, {
    contents: {
      highlights: {
        maxCharacters: 360,
        query,
      },
      text: {
        maxCharacters: 1600,
      },
    },
    excludeText: ["forum"],
    numResults: resultCount,
    systemPrompt:
      "Prefer B2B suppliers, distributors, wholesale catalogs, enterprise procurement pages, product listings, quote pages, and supplier catalogs. Avoid consumer blogs, product reviews, and forums.",
    type: searchType,
  })

  const results = (exaResponse.results as ExaResult[])
    .map((result) => scoreResult(result, normalized, warnings))
    .sort((a, b) => b.estimatedFit - a.estimatedFit)

  return {
    response: {
      filtersUsed: {
        exclude: ["consumer blogs", "reviews", "forums"],
        prefer: [
          "B2B suppliers",
          "distributors",
          "wholesale",
          "enterprise procurement",
          "product listings",
          "quote pages",
          "supplier catalogs",
        ],
      },
      normalizedRequest: normalized,
      queryUsed: query,
      results,
      warnings,
    },
  }
}
