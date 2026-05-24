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

export type ProcurementMetricEvidence = Partial<Record<
  keyof ProcurementSearchMetrics,
  {
    evidenceCount: number
    matchedSignals: string[]
    source: string
  }
>>

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
  metricEvidence?: ProcurementMetricEvidence
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
  highlightScores?: number[]
  links?: string[]
  score?: number
  subpages?: Array<{
    highlights?: string[]
    summary?: string
    text?: string
  }>
  summary?: string
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

function foldSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function searchWords(value: string) {
  return foldSearchText(normalizeText(value)).match(/[a-z0-9]+/g) ?? []
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
  return foldSearchText(value).replace(/[^a-z0-9]+/g, "")
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

function splitLocationTerms(value?: string) {
  if (!value) return []

  return uniqueStrings(
    value
      .split(/\s+(?:and|or)\s+|[,;/&]+/i)
      .map(normalizeText)
      .filter((term) => term.length > 1)
  )
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

function buildEvidenceQuery(request: NormalizedProcurementRequest) {
  const resource = request.resourceType ?? "requested product"
  const specs = request.specifications.length
    ? request.specifications.join(", ")
    : "requested technical specifications"
  const location = locationTerms(request).join(", ") || "requested delivery region"
  const quantity = request.quantity ? `${request.quantity} units` : "bulk quantity"
  const budget = request.budget
    ? `${request.budget.amount} ${request.budget.currency} ${request.budget.type} budget`
    : "pricing or quote evidence"

  return [
    "Find procurement evidence on this supplier page for",
    resource,
    specs,
    quantity,
    location,
    budget,
    "including product availability, B2B or bulk quote support, delivery or service area, pricing clues, compliance, warranty, certifications, supplier reliability, contact sales, catalog, and request quote information.",
  ].join(" ")
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

function findLinkByTerms(links: string[], terms: string[]) {
  return links.find((link) => hasAnyTerm(link, terms))
}

function linkHints(result: ExaResult) {
  const url = result.url
  const links = [url, ...(result.links ?? [])]
  const lower = url.toLowerCase()
  return {
    contact: findLinkByTerms(links, ["contact", "sales", "support"]),
    product:
      findLinkByTerms(links, ["product", "catalog", "shop", "store"]) ??
      (lower.includes("product") || lower.includes("catalog") || lower.includes("shop")
        ? url
        : undefined),
    quote:
      findLinkByTerms(links, ["quote", "quotation", "rfq", "request"]) ??
      (lower.includes("quote") || lower.includes("quotation") || lower.includes("rfq")
        ? url
        : undefined),
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
  const normalizedHaystack = foldSearchText(haystack)
  const compactHaystack = compactText(haystack)
  const normalizedNeedle = foldSearchText(needle)
  const terms = searchWords(needle).filter((word) => word.length > 1)

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
  const normalizedContent = foldSearchText(content)
  const contentWords = new Set(searchWords(content))

  return terms.some((term) => {
    const normalizedTerm = foldSearchText(term).trim()
    if (!normalizedTerm) return false

    const termWords = searchWords(normalizedTerm)
    if (termWords.length === 1 && normalizedTerm.length <= 3) {
      return contentWords.has(normalizedTerm)
    }

    return normalizedContent.includes(normalizedTerm)
  })
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function uniqueMatchedTerms(content: string, terms: string[]) {
  return uniqueStrings(
    terms.filter((term) => term.trim().length > 1 && hasAnyTerm(content, [term]))
  )
}

function weightedTermScore(
  content: string,
  groups: Array<{ terms: string[]; weight: number }>,
  base = 0.12
) {
  let score = base
  const matchedSignals: string[] = []

  for (const group of groups) {
    const matches = uniqueMatchedTerms(content, group.terms)
    if (matches.length === 0) continue

    const matchRatio = Math.min(1, matches.length / Math.max(1, Math.min(group.terms.length, 4)))
    score += group.weight * matchRatio
    matchedSignals.push(...matches.slice(0, 5))
  }

  return {
    evidence: uniqueStrings(matchedSignals).slice(0, 10),
    score: clamp01(score),
  }
}

function scoredEvidence(
  score: number,
  matchedSignals: string[],
  source = "Exa page text, highlights, summaries, subpages, URL, and result score"
) {
  return {
    evidenceCount: matchedSignals.length,
    matchedSignals: uniqueStrings(matchedSignals).slice(0, 10),
    source,
    score: Number(clamp01(score).toFixed(2)),
  }
}

function resultContentForScoring(result: ExaResult) {
  const subpageContent =
    result.subpages
      ?.flatMap((subpage) => [
        subpage.text,
        ...(subpage.highlights ?? []),
      ])
      .filter(Boolean)
      .join(" ") ?? ""
  const linkContent = result.links?.join(" ") ?? ""

  return [
    result.title,
    result.url,
    result.text,
    ...(result.highlights ?? []),
    subpageContent,
    linkContent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function contentDepthScore(result: ExaResult) {
  const textLength = [
    result.text,
    ...(result.highlights ?? []),
    ...(result.subpages?.map((subpage) => subpage.text ?? "") ?? []),
  ].join(" ").length

  return clamp01(textLength / 7000)
}

const countryAliasTerms: Record<string, string[]> = {
  austria: ["osterreich"],
  belgium: ["belgie", "belgique"],
  canada: ["canadian"],
  france: ["french"],
  germany: ["deutschland", "bundesweit", "dach"],
  italy: ["italia"],
  netherlands: ["nederland", "holland"],
  spain: ["espana"],
  switzerland: ["swiss", "schweiz", "suisse", "svizzera"],
  "united kingdom": ["uk", "u k", "great britain", "britain", "gb"],
  "united states": ["usa", "u s", "america"],
}

const countryCodeOverrides: Record<string, string> = {
  uk: "United Kingdom",
}

const regionCoverageTerms = [
  "apac",
  "dach",
  "emea",
  "eu",
  "europe",
  "european union",
  "global",
  "international",
  "worldwide",
]

const deliveryLocationSignalTerms = [
  "availability",
  "available",
  "branches",
  "countrywide",
  "deliver",
  "delivers",
  "delivery",
  "distribution",
  "expedition",
  "fulfillment",
  "locations",
  "logistics",
  "nationwide",
  "regional",
  "service area",
  "serves",
  "ship",
  "shipping",
  "standorte",
  "versand",
  "warehouse",
]

const supplierReliabilityTerms = [
  "about us",
  "authorized",
  "certified",
  "company",
  "contact",
  "customer service",
  "distributor",
  "enterprise",
  "established",
  "manufacturer",
  "partner",
  "privacy policy",
  "reseller",
  "service",
  "support",
  "terms",
  "warranty",
]

const resourceCategoryTerms = [
  "business hardware",
  "computer equipment",
  "hardware",
  "it equipment",
  "it hardware",
  "peripherals",
  "workplace technology",
]

const productCommerceTerms = [
  "add to cart",
  "availability",
  "available",
  "buy",
  "catalog",
  "in stock",
  "product",
  "quote",
  "request quote",
  "shop",
  "sku",
]

const bulkProcurementTerms = [
  "b2b",
  "bulk",
  "business account",
  "corporate",
  "distributor",
  "enterprise",
  "framework agreement",
  "large order",
  "procurement",
  "quote",
  "request quote",
  "reseller",
  "rfq",
  "sales",
  "tender",
  "volume",
  "wholesale",
]

const budgetEvidenceTerms = [
  "budget",
  "discount",
  "eur",
  "euro",
  "financing",
  "leasing",
  "price",
  "pricing",
  "quote",
  "quotation",
  "request quote",
  "volume discount",
]

const deliveryEvidenceTerms = [
  ...deliveryLocationSignalTerms,
  "available for delivery",
  "dispatch",
  "express delivery",
  "in stock",
  "lead time",
  "next day",
  "same day",
  "shipping options",
]

const complianceEvidenceTerms = [
  "approved supplier",
  "certification",
  "certified",
  "compliance",
  "gdpr",
  "hipaa",
  "iso",
  "iso 27001",
  "quality management",
  "soc 2",
  "soc2",
  "sustainability",
  "warranty",
]

const consumerOrContentOnlyTerms = [
  "benchmark",
  "blog",
  "forum",
  "guide",
  "how to",
  "news",
  "reddit",
  "review",
]

function resourceTerms(request: NormalizedProcurementRequest) {
  const resource = request.resourceType ?? ""
  const lower = resource.toLowerCase()
  const terms = [resource]

  if (lower.includes("dock")) {
    terms.push(
      "dock",
      "docking station",
      "docking stations",
      "laptop dock",
      "notebook dock",
      "usb c dock",
      "usb-c dock",
      "thunderbolt dock"
    )
  }
  if (lower.includes("computer")) terms.push("computer", "computers", "desktop", "workstation")
  if (lower.includes("laptop")) terms.push("laptop", "notebook", "business laptop")
  if (lower.includes("monitor")) terms.push("monitor", "display", "screen")
  if (lower.includes("server")) terms.push("server", "rack server", "data center")

  return uniqueStrings(terms)
}

function normalizedCountryKey(value?: string | null) {
  return foldSearchText(value ?? "").replace(/[^a-z0-9]+/g, " ").trim()
}

function countryTerms(country?: string) {
  const countryKey = normalizedCountryKey(country)
  if (!countryKey) return []

  return uniqueStrings([country, countryKey, ...(countryAliasTerms[countryKey] ?? [])])
}

function countryFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const tld = hostname.split(".").at(-1)
    if (!tld || tld.length !== 2) return null

    if (countryCodeOverrides[tld]) return countryCodeOverrides[tld]

    const displayNames = new Intl.DisplayNames(["en"], { type: "region" })
    const country = displayNames.of(tld.toUpperCase())
    return country && country.toUpperCase() !== tld.toUpperCase() ? country : null
  } catch {
    return null
  }
}

function countriesEquivalent(left?: string | null, right?: string | null) {
  if (!left || !right) return false

  const leftTerms = countryTerms(left).map(normalizedCountryKey)
  const rightTerms = countryTerms(right).map(normalizedCountryKey)

  return leftTerms.some((leftTerm) => rightTerms.includes(leftTerm))
}

function locationFitScore(
  result: ExaResult,
  content: string,
  request: NormalizedProcurementRequest
) {
  if (!request.location) {
    return scoredEvidence(0.55, [], "No requested location")
  }

  const requestedPlaceTerms = uniqueStrings([
    ...splitLocationTerms(request.location),
    ...splitLocationTerms(request.locationRegion),
  ])
  const requestedCountryTerms = countryTerms(request.locationCountry)
  const placeMatches = requestedPlaceTerms.filter((term) => textMatches(content, term))
  const countryMatches = requestedCountryTerms.filter((term) => textMatches(content, term))
  const domainCountry = countryFromUrl(result.url)
  const domainCountryMatches = countriesEquivalent(domainCountry, request.locationCountry)
  const hasDeliveryLocationSignal = hasAnyTerm(content, deliveryLocationSignalTerms)
  const hasSupplierMarketSignal = procurementIntentSignal(content)
  const hasRegionalCoverageSignal = hasAnyTerm(content, regionCoverageTerms)
  const matchedSignals = uniqueStrings([
    ...placeMatches,
    ...countryMatches,
    ...(domainCountryMatches && domainCountry ? [`domain:${domainCountry}`] : []),
    ...(hasDeliveryLocationSignal ? uniqueMatchedTerms(content, deliveryLocationSignalTerms).slice(0, 3) : []),
    ...(hasRegionalCoverageSignal ? uniqueMatchedTerms(content, regionCoverageTerms).slice(0, 2) : []),
  ])

  let score = 0.22

  if (requestedPlaceTerms.length > 0 && placeMatches.length > 0) {
    const placeRatio = placeMatches.length / requestedPlaceTerms.length
    score = Math.max(score, placeRatio >= 1 ? 0.96 : 0.78)
  }

  if (countryMatches.length > 0) {
    score = Math.max(score, hasDeliveryLocationSignal ? 0.86 : 0.72)
  }

  if (domainCountryMatches) {
    score = Math.max(score, hasDeliveryLocationSignal ? 0.7 : hasSupplierMarketSignal ? 0.66 : 0.52)
  }

  if (hasRegionalCoverageSignal && requestedCountryTerms.length > 0) {
    score = Math.max(score, hasDeliveryLocationSignal ? 0.64 : 0.48)
  }

  if (score >= 0.65 && hasDeliveryLocationSignal) {
    score = Math.min(1, score + 0.06)
  }

  return scoredEvidence(
    score,
    matchedSignals,
    "Location terms, country/domain market signals, and delivery-region evidence from Exa"
  )
}

const specificationStopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "the",
  "with",
  "into",
  "onto",
  "that",
  "this",
  "existing",
  "fleet",
  "required",
  "compatible",
])

const specificationBoostWords = new Set([
  "compatible",
  "compatibility",
  "dell",
  "hp",
  "lenovo",
  "apple",
  "macbook",
  "thinkpad",
  "latitude",
  "laptop",
  "usb",
  "usb-c",
  "thunderbolt",
  "displayport",
  "hdmi",
  "rtx",
  "nvidia",
  "intel",
  "amd",
])

function specTokens(spec: string) {
  const tokens = words(spec)
    .flatMap((word) => word.split(/[-_]/))
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2)

  return uniqueValues(
    tokens.filter((token) => !specificationStopWords.has(token) || specificationBoostWords.has(token))
  )
}

function tokenMatches(content: string, token: string) {
  const singular = token.endsWith("s") ? token.slice(0, -1) : token
  const compactContent = compactText(content)

  return (
    content.includes(token) ||
    content.includes(singular) ||
    compactContent.includes(compactText(token))
  )
}

function metricFromMatches(total: number, matched: number, emptyValue = 0.5) {
  if (total <= 0) return emptyValue
  return Math.min(1, Math.max(0, matched / total))
}

function negativeContentSignal(content: string) {
  return hasAnyTerm(content, [...consumerOrContentOnlyTerms, "article"])
}

function procurementIntentSignal(content: string) {
  return hasAnyTerm(content, [...bulkProcurementTerms, "availability", "business", "catalog", "supplier"])
}

function specificationFitScore(content: string, request: NormalizedProcurementRequest) {
  if (request.specifications.length === 0) {
    return scoredEvidence(0.55, [], "No requested specifications")
  }

  const tokenGroups = request.specifications.map(specTokens).filter((tokens) => tokens.length > 0)
  const allTokens = uniqueValues(tokenGroups.flat())
  if (allTokens.length === 0) {
    return scoredEvidence(0.55, [], "No searchable specification tokens")
  }

  const matchedTokens = allTokens.filter((token) => tokenMatches(content, token))
  const tokenRatio = matchedTokens.length / allTokens.length
  const matchedPhrases = request.specifications.filter(
    (spec) => searchWords(spec).length <= 3 && textMatches(content, spec)
  )
  const phraseRatio = metricFromMatches(
    request.specifications.length,
    matchedPhrases.length,
    0
  )
  const compatibilityBoost =
    request.specifications.some((spec) => /compatible|compatibility/i.test(spec)) &&
    hasAnyTerm(content, ["compatible", "compatibility", "works with", "for dell", "dell laptop"])
      ? 0.14
      : 0
  const resourceBoost =
    request.resourceType && textMatches(content, request.resourceType)
      ? 0.08
      : 0

  return scoredEvidence(
    tokenRatio * 0.72 + phraseRatio * 0.18 + compatibilityBoost + resourceBoost,
    [...matchedTokens, ...matchedPhrases],
    "Requested specification tokens and Exa page evidence"
  )
}

function resourceFitScore(content: string, request: NormalizedProcurementRequest) {
  if (!request.resourceType) return scoredEvidence(0.5, [], "No requested resource type")

  const primaryTerms = resourceTerms(request)
  const primaryMatches = uniqueMatchedTerms(content, primaryTerms)
  const grouped = weightedTermScore(
    content,
    [
      { terms: primaryTerms, weight: 0.56 },
      { terms: resourceCategoryTerms, weight: 0.16 },
      { terms: productCommerceTerms, weight: 0.16 },
    ],
    0.08
  )

  return scoredEvidence(
    grouped.score,
    [...primaryMatches, ...grouped.evidence],
    "Requested resource terms plus product/catalog evidence from Exa"
  )
}

function bulkFitScore(content: string, request: NormalizedProcurementRequest) {
  const quantitySignals =
    request.quantity && request.quantity >= 50
      ? ["bulk", "large order", "volume", "enterprise", "business", "quote"]
      : ["business", "quote", "sales"]
  const grouped = weightedTermScore(
    content,
    [
      { terms: bulkProcurementTerms, weight: 0.55 },
      { terms: quantitySignals, weight: 0.25 },
      { terms: productCommerceTerms, weight: 0.1 },
    ],
    negativeContentSignal(content) ? 0.04 : 0.12
  )

  return scoredEvidence(
    negativeContentSignal(content) ? grouped.score * 0.55 : grouped.score,
    grouped.evidence,
    "B2B, quote, wholesale, and volume-order signals from Exa"
  )
}

function budgetFitScore(content: string, request: NormalizedProcurementRequest) {
  if (!request.budget) return scoredEvidence(0.55, [], "No requested budget")

  const currencyTerms = [
    request.budget.currency,
    request.budget.currency === "EUR" ? "euro" : null,
    request.budget.currency === "USD" ? "dollar" : null,
  ].filter(Boolean) as string[]
  const grouped = weightedTermScore(
    content,
    [
      { terms: budgetEvidenceTerms, weight: 0.48 },
      { terms: currencyTerms, weight: 0.14 },
      { terms: ["quote", "pricing", "discount", "volume discount"], weight: 0.18 },
    ],
    0.18
  )

  return scoredEvidence(grouped.score, grouped.evidence, "Pricing, quote, discount, and currency evidence from Exa")
}

function deliveryFitScore(content: string, request: NormalizedProcurementRequest) {
  const deliveryTimingTerms = request.deliveryDate
    ? ["delivery", "lead time", "availability", "in stock", "shipping", "dispatch"]
    : ["delivery", "shipping", "availability"]
  const grouped = weightedTermScore(
    content,
    [
      { terms: deliveryEvidenceTerms, weight: 0.5 },
      { terms: deliveryTimingTerms, weight: 0.22 },
      { terms: regionCoverageTerms, weight: 0.1 },
    ],
    0.16
  )

  return scoredEvidence(grouped.score, grouped.evidence, "Delivery, shipping, stock, lead-time, and region evidence from Exa")
}

function complianceFitScore(content: string, request: NormalizedProcurementRequest) {
  const requestedComplianceTerms = request.constraints.filter((constraint) =>
    /approved|cert|compliance|gdpr|hipaa|iso|soc|sustain|warranty/i.test(constraint)
  )
  const grouped = weightedTermScore(
    content,
    [
      { terms: complianceEvidenceTerms, weight: 0.48 },
      { terms: requestedComplianceTerms, weight: 0.22 },
      { terms: ["approved supplier", "authorized", "partner", "warranty"], weight: 0.16 },
    ],
    requestedComplianceTerms.length > 0 ? 0.1 : 0.32
  )

  return scoredEvidence(grouped.score, grouped.evidence, "Compliance, certification, approved-supplier, and warranty evidence from Exa")
}

function reliabilityScore(result: ExaResult, content: string) {
  const grouped = weightedTermScore(
    content,
    [
      { terms: supplierReliabilityTerms, weight: 0.32 },
      { terms: bulkProcurementTerms, weight: 0.18 },
      { terms: productCommerceTerms, weight: 0.14 },
    ],
    0.18
  )
  const exaScoreBoost = clamp01(result.score ?? 0) * 0.18
  const depthBoost = contentDepthScore(result) * 0.1
  const negativePenalty = negativeContentSignal(content) ? 0.28 : 0

  return scoredEvidence(
    grouped.score + exaScoreBoost + depthBoost - negativePenalty,
    grouped.evidence,
    "Supplier intent, official-site signals, Exa relevance, content depth, and negative source penalties"
  )
}

function scoreMetrics(result: ExaResult, request: NormalizedProcurementRequest) {
  const snippet = resultSnippet(result)
  const content = `${resultContentForScoring(result)} ${snippet}`.toLowerCase()
  const resourceFit = resourceFitScore(content, request)
  const specificationFit = specificationFitScore(content, request)
  const locationFit = locationFitScore(result, content, request)
  const bulkFit = bulkFitScore(content, request)
  const budgetFit = budgetFitScore(content, request)
  const deliveryFit = deliveryFitScore(content, request)
  const complianceFit = complianceFitScore(content, request)
  const reliability = reliabilityScore(result, content)
  const metricEvidence: ProcurementMetricEvidence = {
    budgetFit: {
      evidenceCount: budgetFit.evidenceCount,
      matchedSignals: budgetFit.matchedSignals,
      source: budgetFit.source,
    },
    bulkFit: {
      evidenceCount: bulkFit.evidenceCount,
      matchedSignals: bulkFit.matchedSignals,
      source: bulkFit.source,
    },
    complianceFit: {
      evidenceCount: complianceFit.evidenceCount,
      matchedSignals: complianceFit.matchedSignals,
      source: complianceFit.source,
    },
    deliveryFit: {
      evidenceCount: deliveryFit.evidenceCount,
      matchedSignals: deliveryFit.matchedSignals,
      source: deliveryFit.source,
    },
    locationFit: {
      evidenceCount: locationFit.evidenceCount,
      matchedSignals: locationFit.matchedSignals,
      source: locationFit.source,
    },
    reliability: {
      evidenceCount: reliability.evidenceCount,
      matchedSignals: reliability.matchedSignals,
      source: reliability.source,
    },
    resourceFit: {
      evidenceCount: resourceFit.evidenceCount,
      matchedSignals: resourceFit.matchedSignals,
      source: resourceFit.source,
    },
    specificationFit: {
      evidenceCount: specificationFit.evidenceCount,
      matchedSignals: specificationFit.matchedSignals,
      source: specificationFit.source,
    },
  }

  return {
    evidence: metricEvidence,
    metrics: {
      budgetFit: budgetFit.score,
      bulkFit: bulkFit.score,
      complianceFit: complianceFit.score,
      deliveryFit: deliveryFit.score,
      locationFit: locationFit.score,
      reliability: reliability.score,
      resourceFit: resourceFit.score,
      specificationFit: specificationFit.score,
    } satisfies ProcurementSearchMetrics,
  }
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
  const { evidence, metrics } = scoreMetrics(result, request)
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
    links: linkHints(result),
    matchedFields: uniqueValues(matchedFields),
    metricEvidence: evidence,
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
  const evidenceQuery = buildEvidenceQuery(normalized)
  const warnings = buildWarnings(normalized)
  const resultCount = request.searchSettings?.resultCount ?? DEFAULT_RESULT_COUNT
  const searchType = request.searchSettings?.searchType ?? "auto"
  const perQueryResultCount = Math.min(8, Math.max(4, Math.ceil((resultCount * 2) / queryVariants.length)))

  const searchResponses = await Promise.allSettled(
    queryVariants.map((variant) =>
      exa.search(variant, {
        contents: {
          extras: {
            links: 12,
          },
          highlights: {
            maxCharacters: 900,
            query: evidenceQuery,
          },
          maxAgeHours: 168,
          subpages: 2,
          subpageTarget: [
            normalized.resourceType ?? "product catalog",
            "quote contact sales",
            "delivery shipping locations",
          ],
          summary: {
            query: evidenceQuery,
          },
          text: {
            maxCharacters: 5000,
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
