import Exa from "exa-js"
import { z } from "zod"

import {
  procurementFieldKeys,
  procurementFieldSchema,
  requiredProcurementFieldKeys,
} from "@/lib/procurement-extraction"

const MIN_CRITICAL_CONFIDENCE = 0.55
const DEFAULT_RESULT_COUNT = 8
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000

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
    amount: z.number().positive().optional(),
    budgetType: z.enum(["total", "per_unit", "unknown"]).optional(),
    currency: z.string().nullable().optional(),
    value: z.number().positive().optional(),
  })
  .strict()
  .refine((value) => typeof value.value === "number" || typeof value.amount === "number", {
    message: "Budget amount is required",
  })
  .transform((value) => ({
    ...value,
    value: value.value ?? value.amount ?? 0,
  }))

const locationFieldSchema = textFieldSchema
  .extend({
    country: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    validatedBy: z.string().nullable().optional(),
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
    location: locationFieldSchema.optional(),
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
  locationCountry?: string
  locationRegion?: string
  locationValidatedBy?: string
  priority?: "low" | "medium" | "high"
  quantity?: number
  resourceType?: string
  specifications: string[]
}

export type ProcurementSearchMetrics = {
  budgetFit: number
  bulkFit: number
  complianceFit: number
  deliveryFit: number
  locationFit: number
  reliability: number
  resourceFit: number
  specificationFit: number
}

export type ProcurementSupplierResult = {
  companyName: string
  domain: string
  estimatedFit: number
  links: {
    contact?: string
    product?: string
    quote?: string
    website: string
  }
  matchedFields: ProcurementFieldKey[]
  metrics: ProcurementSearchMetrics
  score: number
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
  queryVariants: string[]
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

const procurementSearchCache = new Map<
  string,
  { expiresAt: number; response: ProcurementSearchResponse }
>()

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
  if (!request.readyToSubmit) {
    return "The procurement request is not complete enough to search."
  }

  const enabledRequiredFields = requiredProcurementFieldKeys.filter(
    (field) => !request.ignoredFields.includes(field)
  )
  const missingFields = enabledRequiredFields.filter(
    (field) => !hasRequiredField(request.fields, field)
  )

  if (missingFields.length > 0) {
    return `Missing required procurement fields: ${missingFields.join(", ")}.`
  }

  const lowConfidenceFields = enabledRequiredFields.filter((field) => {
    const value = request.fields[field]
    return value ? value.confidence < MIN_CRITICAL_CONFIDENCE : false
  })

  if (lowConfidenceFields.length > 0) {
    return `Confidence is too low for: ${lowConfidenceFields.join(", ")}.`
  }

  const location = request.fields.location
  if (
    location &&
    !request.ignoredFields.includes("location") &&
    location.validatedBy !== "slm+location_index" &&
    location.validatedBy !== "gazetteer"
  ) {
    return "Location must be validated by the location index before supplier search."
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

  if (
    fields.location &&
    !ignoredFields.includes("location") &&
    (fields.location.validatedBy === "slm+location_index" ||
      fields.location.validatedBy === "gazetteer")
  ) {
    normalized.location = toTitleCase(fields.location.value)
    normalized.locationCountry = fields.location.country
      ? toTitleCase(fields.location.country)
      : undefined
    normalized.locationRegion = fields.location.region
      ? toTitleCase(fields.location.region)
      : undefined
    normalized.locationValidatedBy = fields.location.validatedBy
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

function compactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function normalizeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function originFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.hostname}`
  } catch {
    return url
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return uniqueValues(values.map((value) => value?.trim()).filter(Boolean) as string[])
}

function locationTerms(request: NormalizedProcurementRequest) {
  return uniqueStrings([
    request.location,
    request.locationRegion,
    request.locationCountry,
  ])
}

function constraintQueryTerms(request: NormalizedProcurementRequest) {
  return request.constraints
    .filter((constraint) => constraint.length <= 80)
    .slice(0, 4)
}

function buildExaQueryVariants(request: NormalizedProcurementRequest) {
  const specs = searchableSpecs(request.specifications)
  const specText = specs.join(" ")
  const resource = request.resourceType ?? "business equipment"
  const quantity = request.quantity ? request.quantity.toLocaleString("en-US", { useGrouping: false }) : ""
  const location = locationTerms(request).join(" ")
  const cityOrCountry = request.location ?? request.locationCountry ?? ""
  const country = request.locationCountry ?? request.location ?? ""
  const urgency = request.priority === "high" ? "urgent delivery" : "delivery"
  const constraints = constraintQueryTerms(request).join(" ")
  const delivery = request.deliveryDate ? `delivery by ${request.deliveryDate}` : "delivery"

  return uniqueStrings([
    [
      "bulk supplier",
      quantity,
      specText,
      resource,
      location,
      urgency,
      delivery,
      "enterprise procurement distributor wholesale quote",
      constraints,
    ].join(" "),
    [
      "B2B",
      resource,
      "distributor",
      country,
      specText,
      "bulk order request quote product availability",
      constraints,
    ].join(" "),
    [
      "IT equipment reseller",
      cityOrCountry,
      "business",
      resource,
      "wholesale catalog quote sales contact",
      constraints,
    ].join(" "),
    [
      "enterprise hardware supplier",
      country,
      request.priority === "high" ? "urgent delivery" : "delivery",
      resource,
      specText,
      "B2B procurement catalog",
      constraints,
    ].join(" "),
  ]).slice(0, 4)
}

function buildExaQuery(request: NormalizedProcurementRequest) {
  return buildExaQueryVariants(request)[0] ?? "enterprise procurement supplier quote"
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
    ((request.specifications.some((spec) => /rtx|gpu|nvidia|graphics/i.test(spec)) && unitBudget < 500) ||
      (resourceType.includes("computer") && unitBudget < 250) ||
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

function linkHints(url: string) {
  const lower = url.toLowerCase()
  return {
    contact: lower.includes("contact") ? url : undefined,
    product:
      lower.includes("product") || lower.includes("catalog") || lower.includes("shop")
        ? url
        : undefined,
    quote:
      lower.includes("quote") || lower.includes("quotation") || lower.includes("rfq")
        ? url
        : undefined,
    website: originFromUrl(url),
  }
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

function textMatches(haystack: string, needle: string, mode: "any" | "all" = "any") {
  const normalizedHaystack = haystack.toLowerCase()
  const compactHaystack = compactText(haystack)
  const normalizedNeedle = needle.toLowerCase()
  const terms = words(needle).filter((word) => word.length > 1)

  if (!terms.length) return false
  if (normalizedHaystack.includes(normalizedNeedle) || compactHaystack.includes(compactText(needle))) {
    return true
  }

  const matches = terms.filter((word) => {
    const singular = word.endsWith("s") ? word.slice(0, -1) : word
    return normalizedHaystack.includes(word) || normalizedHaystack.includes(singular)
  })

  return mode === "all" ? matches.length === terms.length : matches.length > 0
}

function hasAnyTerm(content: string, terms: string[]) {
  return terms.some((term) => content.includes(term))
}

function metricFromMatches(total: number, matched: number, emptyValue = 0.5) {
  if (total <= 0) return emptyValue
  return Math.min(1, Math.max(0, matched / total))
}

function negativeContentSignal(content: string) {
  return hasAnyTerm(content, [
    "blog",
    "review",
    "forum",
    "reddit",
    "news",
    "article",
    "how to",
    "guide",
    "benchmark",
  ])
}

function procurementIntentSignal(content: string) {
  return hasAnyTerm(content, [
    "supplier",
    "distributor",
    "reseller",
    "wholesale",
    "enterprise",
    "business",
    "b2b",
    "procurement",
    "quote",
    "quotation",
    "rfq",
    "catalog",
    "sales",
    "availability",
    "volume",
  ])
}

function scoreMetrics(result: ExaResult, request: NormalizedProcurementRequest) {
  const snippet = resultSnippet(result)
  const content = `${result.title ?? ""} ${result.url} ${snippet} ${result.text ?? ""}`.toLowerCase()
  const specMatches = request.specifications.filter((spec) => textMatches(content, spec, "all"))
  const locationValues = locationTerms(request)
  const locationMatches = locationValues.filter((term) => textMatches(content, term))
  const resourceFit = request.resourceType
    ? textMatches(content, request.resourceType) ||
      hasAnyTerm(content, ["hardware", "it equipment", "computer equipment", "workstation"])
      ? 0.9
      : 0.2
    : 0.5
  const specificationFit = metricFromMatches(request.specifications.length, specMatches.length, 0.55)
  const locationFit = metricFromMatches(locationValues.length, locationMatches.length, request.location ? 0.25 : 0.55)
  const bulkFit = procurementIntentSignal(content) ? 0.9 : negativeContentSignal(content) ? 0.15 : 0.45
  const budgetFit = request.budget
    ? hasAnyTerm(content, ["price", "pricing", "quote", "quotation", "discount", "volume"])
      ? 0.68
      : 0.45
    : 0.55
  const deliveryFit = hasAnyTerm(content, [
    "delivery",
    "shipping",
    "ship",
    "availability",
    "in stock",
    "logistics",
    "lead time",
  ])
    ? 0.78
    : 0.42
  const complianceFit = hasAnyTerm(content, [
    "iso",
    "soc 2",
    "soc2",
    "gdpr",
    "hipaa",
    "certified",
    "warranty",
    "compliance",
  ])
    ? 0.78
    : request.constraints.some((constraint) => /iso|soc|gdpr|hipaa|warranty|compliance/i.test(constraint))
      ? 0.3
      : 0.52
  const reliability = negativeContentSignal(content)
    ? 0.18
    : procurementIntentSignal(content)
      ? 0.82
      : 0.58

  return {
    budgetFit,
    bulkFit,
    complianceFit,
    deliveryFit,
    locationFit,
    reliability,
    resourceFit,
    specificationFit,
  } satisfies ProcurementSearchMetrics
}

function weightedScore(metrics: ProcurementSearchMetrics, exaScore?: number) {
  const semanticScore = Math.max(0, Math.min(1, exaScore ?? 0.25))
  return (
    metrics.resourceFit * 0.19 +
    metrics.specificationFit * 0.14 +
    metrics.locationFit * 0.12 +
    metrics.bulkFit * 0.17 +
    metrics.budgetFit * 0.08 +
    metrics.deliveryFit * 0.1 +
    metrics.complianceFit * 0.06 +
    metrics.reliability * 0.1 +
    semanticScore * 0.04
  )
}

function matchedFieldsFromMetrics(
  metrics: ProcurementSearchMetrics,
  request: NormalizedProcurementRequest
) {
  const matchedFields: ProcurementFieldKey[] = []

  if (request.resourceType && metrics.resourceFit >= 0.65) matchedFields.push("resourceType")
  if (request.specifications.length > 0 && metrics.specificationFit >= 0.65) matchedFields.push("specifications")
  if (request.location && metrics.locationFit >= 0.65) matchedFields.push("location")
  if (request.quantity && metrics.bulkFit >= 0.65) matchedFields.push("quantity")
  if (request.deliveryDate && metrics.deliveryFit >= 0.65) matchedFields.push("deliveryDate")
  if (request.budget && metrics.budgetFit >= 0.6) matchedFields.push("budget")
  if (request.constraints.length > 0 && metrics.complianceFit >= 0.65) matchedFields.push("constraints")
  if (request.priority && metrics.deliveryFit >= 0.65) matchedFields.push("priority")

  return uniqueValues(matchedFields)
}

function scoreResult(
  result: ExaResult,
  request: NormalizedProcurementRequest,
  requestWarnings: string[]
): ProcurementSupplierResult {
  const metrics = scoreMetrics(result, request)
  const estimatedFit = Number(Math.min(0.99, Math.max(0.05, weightedScore(metrics, result.score))).toFixed(2))
  const score = Math.round(estimatedFit * 100)
  const matchedFields = matchedFieldsFromMetrics(metrics, request)

  const warnings = [...requestWarnings]
  if (request.location && metrics.locationFit < 0.65) {
    warnings.push("Location fit is not explicit in the result preview.")
  }
  if (request.specifications.length > 0 && metrics.specificationFit < 0.65) {
    warnings.push("Technical specification match is weak in the result preview.")
  }
  if (request.deliveryDate && metrics.deliveryFit < 0.65) {
    warnings.push("Exact delivery deadline needs provider confirmation.")
  }

  const supplierName = supplierNameFromResult(result)
  return {
    companyName: supplierName,
    domain: normalizeDomain(result.url),
    estimatedFit,
    links: linkHints(result.url),
    matchedFields: uniqueValues(matchedFields),
    metrics,
    score,
    snippet: resultSnippet(result),
    supplierName,
    title: result.title?.trim() || supplierName,
    url: result.url,
    warnings: uniqueValues(warnings),
  }
}

function procurementRelevance(result: ProcurementSupplierResult) {
  return (
    result.metrics.resourceFit >= 0.55 ||
    result.metrics.bulkFit >= 0.65 ||
    result.metrics.reliability >= 0.7
  )
}

function dedupeResults(results: ProcurementSupplierResult[]) {
  const byUrl = new Map<string, ProcurementSupplierResult>()

  for (const result of results) {
    const key = result.url.replace(/\/$/, "")
    const current = byUrl.get(key)

    if (!current || result.score > current.score) {
      byUrl.set(key, result)
    }
  }

  return [...byUrl.values()]
}

function cacheKeyForSearch(
  request: NormalizedProcurementRequest,
  settings: ProcurementSearchRequest["searchSettings"]
) {
  return JSON.stringify({
    request,
    resultCount: settings?.resultCount ?? DEFAULT_RESULT_COUNT,
    searchType: settings?.searchType ?? "auto",
  })
}

function getCachedSearch(key: string) {
  const cached = procurementSearchCache.get(key)
  if (!cached) return null

  if (cached.expiresAt < Date.now()) {
    procurementSearchCache.delete(key)
    return null
  }

  return structuredClone(cached.response)
}

function setCachedSearch(key: string, response: ProcurementSearchResponse) {
  procurementSearchCache.set(key, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    response: structuredClone(response),
  })
}

export async function runProcurementSearch(
  request: ProcurementSearchRequest
): Promise<{ response?: ProcurementSearchResponse; status?: number; error?: string }> {
  const { error, normalized } = normalizeRequest(request)

  if (error || !normalized) {
    return { error: error ?? "Invalid procurement request.", status: 422 }
  }

  const cacheKey = cacheKeyForSearch(normalized, request.searchSettings)
  const cached = getCachedSearch(cacheKey)
  if (cached) {
    return { response: cached }
  }

  const apiKey = process.env.EXA_API_KEY

  if (!apiKey) {
    return { error: "Supplier search is not configured.", status: 503 }
  }

  const exa = new Exa(apiKey)
  const queryVariants = buildExaQueryVariants(normalized)
  const query = queryVariants[0] ?? buildExaQuery(normalized)
  const warnings = buildWarnings(normalized)
  const resultCount = request.searchSettings?.resultCount ?? DEFAULT_RESULT_COUNT
  const searchType = request.searchSettings?.searchType ?? "auto"
  const perQueryResultCount = Math.min(8, Math.max(4, Math.ceil((resultCount * 2) / queryVariants.length)))

  const searchResponses = await Promise.allSettled(
    queryVariants.map((variant) =>
      exa.search(variant, {
        contents: {
          highlights: {
            maxCharacters: 360,
            query: variant,
          },
          text: {
            maxCharacters: 1800,
          },
        },
        excludeText: ["forum"],
        numResults: perQueryResultCount,
        systemPrompt:
          "Prefer official company pages, B2B suppliers, distributors, resellers, wholesale catalogs, enterprise procurement pages, product availability pages, request-a-quote pages, and supplier contact or sales pages. Down-rank blogs, reviews, forums, benchmark posts, news articles, and pages that only discuss products without provider intent.",
        type: searchType,
      })
    )
  )

  const exaResults = searchResponses.flatMap((response) =>
    response.status === "fulfilled" ? (response.value.results as ExaResult[]) : []
  )

  if (searchResponses.every((response) => response.status === "rejected")) {
    throw searchResponses[0].reason
  }

  const results = dedupeResults(
    exaResults.map((result) => scoreResult(result, normalized, warnings))
  )
    .filter(procurementRelevance)
    .sort((a, b) => b.score - a.score)
    .slice(0, resultCount)

  const response: ProcurementSearchResponse = {
    filtersUsed: {
      exclude: ["consumer blogs", "reviews", "forums", "news", "benchmark-only content"],
      prefer: [
        "official supplier pages",
        "B2B suppliers",
        "distributors",
        "resellers",
        "wholesale",
        "enterprise procurement",
        "product listings",
        "quote pages",
        "supplier catalogs",
        "contact or sales pages",
      ],
    },
    normalizedRequest: normalized,
    queryUsed: query,
    queryVariants,
    results,
    warnings,
  }

  if (results.length === 0 && exaResults.length === 0) {
    return {
      error: "No Exa supplier results were returned for the structured procurement request.",
      status: 404,
    }
  }

  setCachedSearch(cacheKey, response)

  return {
    response,
  }
}
