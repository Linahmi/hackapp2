import Exa from "exa-js"
import { z } from "zod"

import { procurementFieldSchema } from "@/lib/procurement-extraction"
import type {
  NormalizedProcurementRequest,
  ProcurementSupplierResult,
} from "@/lib/procurement-search"

const COMPANY_DETAILS_CACHE_TTL_MS = 10 * 60 * 1000

const normalizedRequestSchema = z
  .object({
    budget: z
      .object({
        amount: z.number().positive(),
        currency: z.string().min(1),
        type: z.enum(["total", "per_unit", "unknown"]),
      })
      .optional(),
    constraints: z.array(z.string()),
    deliveryDate: z.string().optional(),
    ignoredFields: z.array(procurementFieldSchema),
    location: z.string().optional(),
    locationCountry: z.string().optional(),
    locationRegion: z.string().optional(),
    locationValidatedBy: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    quantity: z.number().int().positive().optional(),
    resourceType: z.string().optional(),
    specifications: z.array(z.string()),
  })
  .strict()

const supplierResultSchema = z
  .object({
    companyName: z.string(),
    domain: z.string(),
    estimatedFit: z.number().min(0).max(1),
    links: z
      .object({
        contact: z.string().url().optional(),
        product: z.string().url().optional(),
        quote: z.string().url().optional(),
        website: z.string().url(),
      })
      .strict(),
    matchedFields: z.array(procurementFieldSchema),
    metricEvidence: z
      .record(
        z.string(),
        z
          .object({
            evidenceCount: z.number().int().min(0),
            matchedSignals: z.array(z.string()),
            source: z.string(),
          })
          .strict()
      )
      .optional(),
    metrics: z
      .object({
        budgetFit: z.number().min(0).max(1),
        bulkFit: z.number().min(0).max(1),
        complianceFit: z.number().min(0).max(1),
        deliveryFit: z.number().min(0).max(1),
        locationFit: z.number().min(0).max(1),
        reliability: z.number().min(0).max(1),
        resourceFit: z.number().min(0).max(1),
        specificationFit: z.number().min(0).max(1),
      })
      .strict(),
    score: z.number().min(0).max(100),
    snippet: z.string(),
    supplierName: z.string(),
    title: z.string(),
    url: z.string().url(),
    warnings: z.array(z.string()),
  })
  .strict()

export const companyDetailsRequestSchema = z
  .object({
    company: supplierResultSchema.optional(),
    normalizedRequest: normalizedRequestSchema,
    rawText: z.string().min(1).max(6000),
    selectedCompany: supplierResultSchema.optional(),
  })
  .strict()
  .refine((value) => value.company || value.selectedCompany, {
    message: "selectedCompany is required",
    path: ["selectedCompany"],
  })

const evidenceSchema = z
  .object({
    snippet: z.string(),
    title: z.string(),
    url: z.string().url(),
  })
  .strict()

const linkEvidenceSchema = z
  .object({
    title: z.string(),
    url: z.string().url(),
  })
  .strict()

const riskSchema = z
  .object({
    evidence: z.array(evidenceSchema),
    message: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    type: z.enum(["budget", "delivery", "availability", "specification", "compliance", "supplier"]),
  })
  .strict()

export const companyDetailsResponseSchema = z
  .object({
    availability: z
      .object({
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema),
        status: z.enum(["available", "likely_available", "uncertain", "not_available"]),
        summary: z.string(),
      })
      .strict(),
    buyingLinks: z
      .object({
        catalogPages: z.array(linkEvidenceSchema),
        contactPages: z.array(linkEvidenceSchema),
        productPages: z.array(linkEvidenceSchema),
        quotePages: z.array(linkEvidenceSchema),
      })
      .strict(),
    company: z
      .object({
        domain: z.string(),
        name: z.string(),
        website: z.string().url(),
      })
      .strict(),
    compliance: z
      .object({
        certifications: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema),
        status: z.enum(["matched", "partial", "unknown"]),
        summary: z.string(),
      })
      .strict(),
    deliveryFit: z
      .object({
        confidence: z.number().min(0).max(1),
        deadlineFit: z.enum(["likely", "uncertain", "unlikely"]),
        evidence: z.array(evidenceSchema),
        locationFit: z.boolean(),
        status: z.enum(["good", "possible", "uncertain", "bad"]),
        summary: z.string(),
      })
      .strict(),
    matchedSpecifications: z
      .object({
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema),
        matched: z.array(z.string()),
        missing: z.array(z.string()),
        status: z.enum(["matched", "partial", "uncertain", "not_matched"]),
        summary: z.string(),
      })
      .strict(),
    overallRecommendation: z
      .object({
        confidence: z.number().min(0).max(1),
        status: z.enum(["strong_fit", "possible_fit", "weak_fit", "bad_fit"]),
        summary: z.string(),
      })
      .strict(),
    priceRange: z
      .object({
        basis: z.string(),
        confidence: z.number().min(0).max(1),
        currency: z.string(),
        evidence: z.array(evidenceSchema),
        quoteRequired: z.boolean(),
        status: z.enum(["found", "estimated", "unknown"]),
        totalMax: z.number().nullable(),
        totalMin: z.number().nullable(),
        unitMax: z.number().nullable(),
        unitMin: z.number().nullable(),
      })
      .strict(),
    risks: z.array(riskSchema),
  })
  .strict()

export const quoteRequestSchema = z
  .object({
    companyDetails: companyDetailsResponseSchema.nullable().optional(),
    normalizedRequest: normalizedRequestSchema,
    rawText: z.string().min(1).max(6000),
    selectedCompany: supplierResultSchema,
  })
  .strict()

export type ProcurementCompanyDetails = z.infer<typeof companyDetailsResponseSchema>

export type ProcurementQuoteResponse = {
  documentText: string
  email: {
    body: string
    canSend: boolean
    recipient: string | null
    subject: string
  }
  quotation: {
    appName: string
    generatedDate: string
    providerCompany: string
    sections: {
      label: string
      value: string | string[]
    }[]
    title: string
  }
}

type ExaResult = {
  highlights?: string[]
  links?: string[]
  summary?: string
  text?: string
  title: string | null
  url: string
}

type DetailEvidence = z.infer<typeof evidenceSchema> & {
  category: "product" | "pricing" | "delivery" | "compliance" | "contact" | "source"
  links: string[]
}

const companyDetailsCache = new Map<string, { details: ProcurementCompanyDetails; expiresAt: number }>()

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function foldText(value: string) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function words(value: string) {
  return foldText(value).match(/[a-z0-9]+/g) ?? []
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)]
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function domainFromUrl(url: string) {
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

function resultSnippet(result: ExaResult) {
  const text = result.highlights?.[0] ?? result.summary ?? result.text ?? ""
  const cleaned = normalizeText(text)
  if (cleaned.length <= 360) return cleaned
  return `${cleaned.slice(0, 357)}...`
}

function evidenceFromCompany(company: ProcurementSupplierResult): DetailEvidence {
  return {
    category: "source",
    links: Object.values(company.links ?? {}).filter(Boolean),
    snippet: company.snippet,
    title: company.title,
    url: company.url,
  }
}

function textMatches(content: string, value: string) {
  const normalizedContent = foldText(content)
  const normalizedValue = foldText(value)
  if (!normalizedValue) return false
  return normalizedContent.includes(normalizedValue)
}

function hasAnyTerm(content: string, terms: string[]) {
  return terms.some((term) => textMatches(content, term))
}

function evidenceText(evidence: DetailEvidence[]) {
  return evidence
    .map((item) => `${item.title} ${item.snippet} ${item.url} ${item.links.join(" ")}`)
    .join(" ")
}

function compactEvidence(item: DetailEvidence): z.infer<typeof evidenceSchema> {
  return {
    snippet: item.snippet,
    title: item.title,
    url: item.url,
  }
}

function topEvidence(
  evidence: DetailEvidence[],
  predicate: (item: DetailEvidence) => boolean,
  limit = 3
) {
  return evidence.filter(predicate).slice(0, limit).map(compactEvidence)
}

function uniqueByUrl<T extends { url: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.url.replace(/\/$/, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function classifyUrl(url: string): DetailEvidence["category"] {
  const lower = url.toLowerCase()
  if (lower.includes("contact")) return "contact"
  if (lower.includes("quote") || lower.includes("quotation") || lower.includes("rfq")) return "pricing"
  if (lower.includes("delivery") || lower.includes("shipping") || lower.includes("versand")) return "delivery"
  if (lower.includes("compliance") || lower.includes("cert") || lower.includes("iso")) return "compliance"
  if (lower.includes("product") || lower.includes("catalog") || lower.includes("shop")) return "product"
  return "source"
}

function linkTitle(url: string) {
  const category = classifyUrl(url)
  const labels = {
    compliance: "Compliance page",
    contact: "Contact page",
    delivery: "Delivery page",
    pricing: "Quote or pricing page",
    product: "Product or catalog page",
    source: "Source page",
  }

  return labels[category]
}

function requestResourceTerms(request: NormalizedProcurementRequest) {
  const resource = request.resourceType ?? ""
  const lower = resource.toLowerCase()
  const terms = [resource]

  if (lower.includes("dock")) terms.push("dock", "docking station", "usb-c dock", "thunderbolt dock")
  if (lower.includes("computer")) terms.push("computer", "desktop", "workstation", "pc")
  if (lower.includes("laptop")) terms.push("laptop", "notebook", "business laptop")
  if (lower.includes("monitor")) terms.push("monitor", "display", "screen")
  if (lower.includes("server")) terms.push("server", "rack server", "data center")

  return uniqueValues(terms.filter(Boolean))
}

function specTokens(spec: string) {
  const stopWords = new Set(["and", "with", "the", "for", "existing", "fleet", "compatible"])
  return uniqueValues(words(spec).filter((word) => word.length > 1 && !stopWords.has(word)))
}

function buildDetailQueries(domain: string, request: NormalizedProcurementRequest) {
  const resource = request.resourceType ?? "business equipment"
  const specs = request.specifications.join(" ")
  const location = request.location ?? request.locationCountry ?? ""
  const country = request.locationCountry ?? request.location ?? ""

  return [
    { category: "product" as const, query: `site:${domain} ${resource} ${specs}` },
    { category: "product" as const, query: `site:${domain} ${resource} catalog` },
    { category: "product" as const, query: `site:${domain} ${specs} product` },
    { category: "pricing" as const, query: `site:${domain} ${resource} price` },
    { category: "pricing" as const, query: `site:${domain} request quote` },
    { category: "pricing" as const, query: `site:${domain} sales quote procurement` },
    { category: "delivery" as const, query: `site:${domain} delivery shipping` },
    { category: "delivery" as const, query: `site:${domain} delivery ${location}` },
    { category: "delivery" as const, query: `site:${domain} shipping ${country}` },
    { category: "compliance" as const, query: `site:${domain} compliance certifications ISO security` },
    { category: "compliance" as const, query: `site:${domain} about certifications ISO HIPAA SOC CSA STAR` },
    { category: "contact" as const, query: `site:${domain} contact sales business procurement` },
  ].filter((item) => item.query.replace(`site:${domain}`, "").trim().length > 0)
}

async function fetchCompanyEvidence(
  company: ProcurementSupplierResult,
  request: NormalizedProcurementRequest
) {
  const domain = company.domain || domainFromUrl(company.url)
  const evidence: DetailEvidence[] = [evidenceFromCompany(company)]
  const metadataLinks = Object.values(company.links ?? {}).filter(Boolean)

  for (const link of metadataLinks) {
    evidence.push({
      category: classifyUrl(link),
      links: [],
      snippet: `${linkTitle(link)} from supplier search metadata.`,
      title: linkTitle(link),
      url: link,
    })
  }

  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return uniqueByUrl(evidence)

  const exa = new Exa(apiKey)
  const queries = buildDetailQueries(domain, request)

  const responses = await Promise.allSettled(
    queries.map((item) =>
      exa.search(item.query, {
        contents: {
          extras: { links: 12 },
          highlights: {
            maxCharacters: 700,
            query: item.query,
          },
          summary: {
            query:
              "Summarize only supplier evidence for products, prices, quotes, delivery, service region, certifications, compliance, and contact options. Do not infer beyond the page.",
          },
          text: {
            maxCharacters: 2500,
          },
        },
        includeDomains: [domain],
        numResults: 2,
        systemPrompt:
          "Prefer official product, catalog, quote, delivery, compliance, about, and contact pages from the selected supplier domain. Avoid blogs, manuals, and unrelated pages.",
        type: "auto",
      })
    )
  )

  responses.forEach((response, index) => {
    if (response.status !== "fulfilled") return
    const category = queries[index]?.category ?? "source"

    for (const result of response.value.results as ExaResult[]) {
      evidence.push({
        category,
        links: result.links ?? [],
        snippet: resultSnippet(result),
        title: result.title?.trim() || domainFromUrl(result.url),
        url: result.url,
      })

      for (const link of result.links ?? []) {
        if (domainFromUrl(link) !== domain) continue
        evidence.push({
          category: classifyUrl(link),
          links: [],
          snippet: `${linkTitle(link)} discovered on ${result.title?.trim() || domain}.`,
          title: linkTitle(link),
          url: link,
        })
      }
    }
  })

  if (responses.every((response) => response.status === "rejected")) {
    console.error("Procurement company detail Exa searches failed", responses[0]?.reason)
  }

  return uniqueByUrl(evidence)
}

function buyingLinks(evidence: DetailEvidence[]) {
  const toLinks = (category: DetailEvidence["category"], terms: string[] = []) =>
    uniqueByUrl(
      evidence
        .filter((item) => item.category === category || hasAnyTerm(item.url, terms))
        .map((item) => ({ title: item.title || linkTitle(item.url), url: item.url }))
    ).slice(0, 5)

  return {
    catalogPages: toLinks("product", ["catalog", "category"]),
    contactPages: toLinks("contact", ["contact", "sales"]),
    productPages: toLinks("product", ["product", "shop", "store"]),
    quotePages: toLinks("pricing", ["quote", "rfq", "request"]),
  }
}

function availabilityDetails(
  request: NormalizedProcurementRequest,
  evidence: DetailEvidence[]
): ProcurementCompanyDetails["availability"] {
  const content = evidenceText(evidence)
  const resourceTerms = requestResourceTerms(request)
  const resourceHits = resourceTerms.filter((term) => textMatches(content, term))
  const productEvidence = topEvidence(
    evidence,
    (item) => item.category === "product" || resourceTerms.some((term) => textMatches(`${item.title} ${item.snippet} ${item.url}`, term))
  )
  const exactSpecHit = request.specifications.some((spec) => textMatches(content, spec))

  if (exactSpecHit && productEvidence.length > 0) {
    return {
      confidence: 0.82,
      evidence: productEvidence,
      status: "available",
      summary: `Relevant ${request.resourceType ?? "product"} evidence and requested specifications appear on supplier pages.`,
    }
  }

  if (resourceHits.length > 0 || productEvidence.length > 0) {
    return {
      confidence: productEvidence.length > 0 ? 0.7 : 0.58,
      evidence: productEvidence,
      status: "likely_available",
      summary: `Supplier evidence references ${resourceHits.slice(0, 3).join(", ") || request.resourceType || "the requested product category"}. Exact availability should be checked through quote or sales links.`,
    }
  }

  if (evidence.length > 1) {
    return {
      confidence: 0.36,
      evidence: evidence.slice(0, 2).map(compactEvidence),
      status: "uncertain",
      summary: "Fetched pages show supplier presence, but no strong product/category evidence for this request.",
    }
  }

  return {
    confidence: 0.18,
    evidence: evidence.slice(0, 1).map(compactEvidence),
    status: "not_available",
    summary: "Fetched evidence did not show relevant product or category signals for the requested resource.",
  }
}

function parsePriceAmounts(content: string, preferredCurrency: string) {
  const matches = content.match(/(?:€|\$|£|eur|usd|gbp|chf)\s*[\d][\d.,]*(?:\s?k)?|[\d][\d.,]*(?:\s?k)?\s*(?:€|\$|£|eur|usd|gbp|chf)/gi) ?? []

  return matches
    .map((match) => {
      const lower = match.toLowerCase()
      const multiplier = /\bk\b/.test(lower) ? 1000 : 1
      const numeric = lower
        .replace(/,/g, "")
        .replace(/[^\d.]/g, "")
      const amount = Number(numeric) * multiplier
      const currency =
        lower.includes("€") || lower.includes("eur")
          ? "EUR"
          : lower.includes("£") || lower.includes("gbp")
            ? "GBP"
            : lower.includes("chf")
              ? "CHF"
              : lower.includes("$") || lower.includes("usd")
                ? "USD"
                : preferredCurrency

      return Number.isFinite(amount) && amount > 0 ? { amount, currency, text: match } : null
    })
    .filter(Boolean)
    .filter((price): price is { amount: number; currency: string; text: string } => Boolean(price))
}

function estimatedUnitRange(request: NormalizedProcurementRequest) {
  const resource = `${request.resourceType ?? ""} ${request.specifications.join(" ")}`.toLowerCase()
  let min = 120
  let max = 900

  if (resource.includes("dock")) [min, max] = [120, 350]
  else if (resource.includes("rtx") || resource.includes("gpu")) [min, max] = [500, 1200]
  else if (resource.includes("server")) [min, max] = [1500, 8000]
  else if (resource.includes("laptop")) [min, max] = [600, 1800]
  else if (resource.includes("computer") || resource.includes("workstation")) [min, max] = [500, 1400]
  else if (resource.includes("monitor")) [min, max] = [120, 600]

  if (request.constraints.some((constraint) => /refurb|used|renew/i.test(constraint))) {
    min *= 0.45
    max *= 0.7
  }

  return {
    max: Math.round(max),
    min: Math.round(min),
  }
}

function priceDetails(
  request: NormalizedProcurementRequest,
  evidence: DetailEvidence[],
  links: ReturnType<typeof buyingLinks>
): ProcurementCompanyDetails["priceRange"] {
  const currency = request.budget?.currency ?? "USD"
  const content = evidenceText(evidence)
  const priceEvidence = topEvidence(evidence, (item) => hasAnyTerm(`${item.title} ${item.snippet} ${item.url}`, ["price", "pricing", "€", "$", "eur", "usd", "quote"]))
  const prices = parsePriceAmounts(content, currency).filter((price) => price.amount >= 5 && price.amount <= 50_000)
  const quantity = request.quantity ?? 1
  const quoteRequired = links.quotePages.length > 0 || quantity >= 25

  if (prices.length > 0) {
    const sameCurrency = prices.filter((price) => price.currency === prices[0].currency)
    const amounts = sameCurrency.map((price) => price.amount).sort((a, b) => a - b)
    const unitMin = Math.round(amounts[0])
    const unitMax = Math.round(amounts[Math.min(amounts.length - 1, Math.max(0, amounts.length - 1))])

    return {
      basis: "Public price-like values were found in fetched supplier evidence. Treat as indicative until supplier quote confirms SKU, quantity, and terms.",
      confidence: 0.68,
      currency: sameCurrency[0]?.currency ?? currency,
      evidence: priceEvidence.length ? priceEvidence : evidence.slice(0, 2).map(compactEvidence),
      quoteRequired,
      status: "found",
      totalMax: unitMax * quantity,
      totalMin: unitMin * quantity,
      unitMax,
      unitMin,
    }
  }

  const range = estimatedUnitRange(request)
  const hasUsableEvidence = evidence.length > 0 || Boolean(request.resourceType)

  if (!hasUsableEvidence) {
    return {
      basis: "No usable supplier or request evidence was available for a price estimate.",
      confidence: 0.1,
      currency,
      evidence: [],
      quoteRequired: true,
      status: "unknown",
      totalMax: null,
      totalMin: null,
      unitMax: null,
      unitMin: null,
    }
  }

  return {
    basis: `Estimated from requested ${request.resourceType ?? "hardware"} class, specifications, quantity, and bulk procurement context; this is not an official supplier price.`,
    confidence: request.resourceType ? 0.48 : 0.32,
    currency,
    evidence: priceEvidence.length ? priceEvidence : evidence.slice(0, 2).map(compactEvidence),
    quoteRequired: true,
    status: "estimated",
    totalMax: range.max * quantity,
    totalMin: range.min * quantity,
    unitMax: range.max,
    unitMin: range.min,
  }
}

function daysUntil(date?: string) {
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parsed.getTime() - today.getTime()) / 86_400_000)
}

function deliveryDetails(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult,
  evidence: DetailEvidence[]
): ProcurementCompanyDetails["deliveryFit"] {
  const content = evidenceText(evidence)
  const deliveryTerms = ["delivery", "shipping", "ship", "versand", "logistics", "lead time", "availability", "in stock", "dispatch"]
  const locationTerms = [request.location, request.locationCountry, request.locationRegion].filter(Boolean) as string[]
  const deliveryEvidence = topEvidence(evidence, (item) => item.category === "delivery" || hasAnyTerm(`${item.title} ${item.snippet} ${item.url}`, deliveryTerms))
  const locationFit =
    locationTerms.some((term) => textMatches(content, term)) ||
    company.matchedFields.includes("location") ||
    (request.locationCountry ? domainCountryMatches(company.url, request.locationCountry) : false)
  const deliverySignal = hasAnyTerm(content, deliveryTerms) || company.metrics.deliveryFit >= 0.65
  const deadlineDays = daysUntil(request.deliveryDate)
  const hasFastDeliverySignal = hasAnyTerm(content, ["express", "same day", "next day", "in stock", "available", "dispatch"])
  const deadlineFit =
    deadlineDays === null || deadlineDays >= 21
      ? "likely"
      : deadlineDays <= 7 && !hasFastDeliverySignal
        ? "unlikely"
        : "uncertain"

  if (locationFit && deliverySignal) {
    return {
      confidence: deadlineFit === "unlikely" ? 0.58 : 0.76,
      deadlineFit,
      evidence: deliveryEvidence,
      locationFit: true,
      status: deadlineFit === "unlikely" ? "possible" : "good",
      summary: `Supplier evidence supports delivery or service coverage for ${request.location ?? request.locationCountry ?? "the requested region"}. Deadline fit is ${deadlineFit}.`,
    }
  }

  if (locationFit || deliverySignal) {
    return {
      confidence: 0.52,
      deadlineFit,
      evidence: deliveryEvidence.length ? deliveryEvidence : evidence.slice(0, 2).map(compactEvidence),
      locationFit,
      status: "possible",
      summary: locationFit
        ? "Supplier appears relevant to the requested market; explicit delivery terms were limited in fetched evidence."
        : "Delivery/shipping signals were found, but requested location coverage is not explicit.",
    }
  }

  return {
    confidence: 0.28,
    deadlineFit: deadlineFit === "unlikely" ? "unlikely" : "uncertain",
    evidence: evidence.slice(0, 2).map(compactEvidence),
    locationFit: false,
    status: "uncertain",
    summary: "Fetched evidence did not show strong delivery or location coverage signals.",
  }
}

function domainCountryMatches(url: string, country: string) {
  const countryKey = foldText(country)
  const tld = domainFromUrl(url).split(".").at(-1)?.toLowerCase()
  const countryCodes: Record<string, string> = {
    at: "austria",
    be: "belgium",
    ca: "canada",
    ch: "switzerland",
    de: "germany",
    es: "spain",
    fr: "france",
    it: "italy",
    nl: "netherlands",
    uk: "united kingdom",
    us: "united states",
  }

  return tld ? countryCodes[tld] === countryKey : false
}

function complianceDetails(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult,
  evidence: DetailEvidence[]
): ProcurementCompanyDetails["compliance"] {
  const content = evidenceText(evidence)
  const certificationMap: Array<[string, RegExp]> = [
    ["ISO 27001", /\biso\s?27001\b/i],
    ["ISO 9001", /\biso\s?9001\b/i],
    ["SOC 2", /\bsoc\s?2\b/i],
    ["GDPR", /\bgdpr\b/i],
    ["HIPAA", /\bhipaa\b/i],
    ["CSA STAR", /\bcsa\s?star\b/i],
    ["PCI DSS", /\bpci\s?dss\b/i],
  ]
  const certifications = certificationMap
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => label)
  const metricSignals = company.metricEvidence?.complianceFit?.matchedSignals ?? []
  const complianceEvidence = topEvidence(evidence, (item) => item.category === "compliance" || hasAnyTerm(`${item.title} ${item.snippet} ${item.url}`, ["iso", "soc", "gdpr", "hipaa", "certification", "compliance", "warranty"]))
  const partialSignals = hasAnyTerm(content, ["compliance", "certified", "warranty", "authorized", "approved supplier"]) || metricSignals.length > 0

  if (certifications.length > 0) {
    return {
      certifications: uniqueValues(certifications),
      confidence: 0.8,
      evidence: complianceEvidence,
      status: "matched",
      summary: `Public evidence references ${uniqueValues(certifications).join(", ")}.`,
    }
  }

  if (partialSignals) {
    return {
      certifications: [],
      confidence: 0.48,
      evidence: complianceEvidence.length ? complianceEvidence : evidence.slice(0, 2).map(compactEvidence),
      status: "partial",
      summary: "Fetched evidence contains compliance-adjacent signals such as authorization, warranty, certification, or approved-supplier language, but no named certification was found.",
    }
  }

  return {
    certifications: [],
    confidence: request.constraints.length > 0 ? 0.24 : 0.32,
    evidence: evidence.slice(0, 2).map(compactEvidence),
    status: "unknown",
    summary: "No public compliance evidence found in fetched pages.",
  }
}

function specificationDetails(
  request: NormalizedProcurementRequest,
  evidence: DetailEvidence[]
): ProcurementCompanyDetails["matchedSpecifications"] {
  const content = evidenceText(evidence)
  const matched: string[] = []
  const missing: string[] = []

  for (const spec of request.specifications) {
    const tokens = specTokens(spec)
    const tokenMatches = tokens.filter((token) => textMatches(content, token))
    if (textMatches(content, spec) || (tokens.length > 0 && tokenMatches.length / tokens.length >= 0.75)) {
      matched.push(spec)
    } else {
      missing.push(spec)
    }
  }

  const resourceMatches = requestResourceTerms(request).filter((term) => textMatches(content, term))
  const specEvidence = topEvidence(evidence, (item) => request.specifications.some((spec) => specTokens(spec).some((token) => textMatches(`${item.title} ${item.snippet} ${item.url}`, token))) || resourceMatches.some((term) => textMatches(`${item.title} ${item.snippet} ${item.url}`, term)))

  if (request.specifications.length === 0 && resourceMatches.length > 0) {
    return {
      confidence: 0.54,
      evidence: specEvidence,
      matched: resourceMatches.slice(0, 3),
      missing: [],
      status: "uncertain",
      summary: "No explicit technical specifications were requested, but fetched evidence matches the resource category.",
    }
  }

  if (missing.length === 0 && matched.length > 0) {
    return {
      confidence: 0.78,
      evidence: specEvidence,
      matched,
      missing,
      status: "matched",
      summary: "Requested technical specifications are visible in fetched supplier evidence.",
    }
  }

  if (matched.length > 0 || resourceMatches.length > 0) {
    return {
      confidence: matched.length > 0 ? 0.58 : 0.42,
      evidence: specEvidence,
      matched: matched.length > 0 ? matched : resourceMatches.slice(0, 3),
      missing,
      status: "partial",
      summary: "Fetched evidence matches the product family or part of the requested specification, but not every requested detail is public.",
    }
  }

  return {
    confidence: 0.22,
    evidence: evidence.slice(0, 2).map(compactEvidence),
    matched: [],
    missing: request.specifications,
    status: request.specifications.length > 0 ? "not_matched" : "uncertain",
    summary: "Fetched evidence does not visibly match the requested specifications.",
  }
}

function risks(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult,
  details: Pick<
    ProcurementCompanyDetails,
    "availability" | "priceRange" | "deliveryFit" | "compliance" | "matchedSpecifications"
  >
): ProcurementCompanyDetails["risks"] {
  const values: ProcurementCompanyDetails["risks"] = []

  if (request.budget && details.priceRange.totalMin && request.budget.type === "total" && request.budget.amount < details.priceRange.totalMin) {
    values.push({
      evidence: details.priceRange.evidence,
      message: `Requested budget is below the estimated low range (${details.priceRange.totalMin.toLocaleString()} ${details.priceRange.currency}).`,
      severity: "high",
      type: "budget",
    })
  }

  if (details.deliveryFit.deadlineFit === "unlikely") {
    values.push({
      evidence: details.deliveryFit.evidence,
      message: "Requested delivery deadline appears tight relative to the fetched delivery evidence.",
      severity: "high",
      type: "delivery",
    })
  }

  if (details.availability.status === "uncertain" || details.availability.status === "not_available") {
    values.push({
      evidence: details.availability.evidence,
      message: "Public supplier pages do not clearly show availability for the requested product/category.",
      severity: details.availability.status === "not_available" ? "high" : "medium",
      type: "availability",
    })
  }

  if (details.matchedSpecifications.status === "partial" || details.matchedSpecifications.status === "not_matched") {
    values.push({
      evidence: details.matchedSpecifications.evidence,
      message: details.matchedSpecifications.missing.length
        ? `Some requested specifications were not visible publicly: ${details.matchedSpecifications.missing.join(", ")}.`
        : "Exact specification match is not fully visible in public evidence.",
      severity: details.matchedSpecifications.status === "not_matched" ? "high" : "medium",
      type: "specification",
    })
  }

  if (details.compliance.status === "unknown" && request.constraints.length > 0) {
    values.push({
      evidence: details.compliance.evidence,
      message: "Requested compliance or approved-supplier constraints were not supported by public evidence.",
      severity: "medium",
      type: "compliance",
    })
  }

  if (details.priceRange.quoteRequired) {
    values.push({
      evidence: details.priceRange.evidence,
      message: "A formal quote is required before relying on price, availability, and delivery assumptions.",
      severity: "low",
      type: "supplier",
    })
  }

  if ((request.quantity ?? 0) >= 100 && company.metrics.bulkFit < 0.5) {
    values.push({
      evidence: company.metricEvidence?.bulkFit?.matchedSignals.map((signal) => ({
        snippet: signal,
        title: "Bulk evidence signal",
        url: company.url,
      })) ?? [],
      message: "Supplier result has limited public evidence for high-volume or enterprise procurement.",
      severity: "medium",
      type: "supplier",
    })
  }

  return values
}

function overallRecommendation(
  details: Pick<
    ProcurementCompanyDetails,
    "availability" | "priceRange" | "deliveryFit" | "compliance" | "matchedSpecifications" | "risks"
  >
): ProcurementCompanyDetails["overallRecommendation"] {
  const availabilityScore = {
    available: 1,
    likely_available: 0.78,
    uncertain: 0.42,
    not_available: 0.08,
  }[details.availability.status]
  const deliveryScore = {
    bad: 0.08,
    good: 0.9,
    possible: 0.58,
    uncertain: 0.34,
  }[details.deliveryFit.status]
  const specScore = {
    matched: 0.9,
    not_matched: 0.08,
    partial: 0.56,
    uncertain: 0.36,
  }[details.matchedSpecifications.status]
  const complianceScore = {
    matched: 0.75,
    partial: 0.48,
    unknown: 0.32,
  }[details.compliance.status]
  const priceScore = details.priceRange.status === "found" ? 0.72 : details.priceRange.status === "estimated" ? 0.5 : 0.24
  const severePenalty = details.risks.some((risk) => risk.severity === "high") ? 0.18 : 0
  const score = clamp01(
    availabilityScore * 0.25 +
      deliveryScore * 0.2 +
      specScore * 0.22 +
      complianceScore * 0.12 +
      priceScore * 0.14 +
      0.07 -
      severePenalty
  )
  const status =
    score >= 0.76
      ? "strong_fit"
      : score >= 0.5
        ? "possible_fit"
        : score >= 0.28
          ? "weak_fit"
          : "bad_fit"

  return {
    confidence: Number(score.toFixed(2)),
    status,
    summary:
      status === "strong_fit"
        ? "Supplier appears to be a strong candidate based on product, delivery, and evidence coverage."
        : status === "possible_fit"
          ? "Supplier is a plausible candidate, but RFQ confirmation is needed for gaps in public evidence."
          : status === "weak_fit"
            ? "Supplier may be usable, but multiple important fields are weak or uncertain."
            : "Supplier evidence does not support the request well enough to recommend without substantial follow-up.",
  }
}

function cacheKeyForDetails(company: ProcurementSupplierResult, request: NormalizedProcurementRequest) {
  return JSON.stringify({
    domain: company.domain || domainFromUrl(company.url),
    request,
  })
}

function getCachedDetails(key: string) {
  const cached = companyDetailsCache.get(key)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    companyDetailsCache.delete(key)
    return null
  }
  return structuredClone(cached.details)
}

function setCachedDetails(key: string, details: ProcurementCompanyDetails) {
  companyDetailsCache.set(key, {
    details: structuredClone(details),
    expiresAt: Date.now() + COMPANY_DETAILS_CACHE_TTL_MS,
  })
}

export async function getProcurementCompanyDetails(
  request: z.infer<typeof companyDetailsRequestSchema>
): Promise<ProcurementCompanyDetails> {
  const company = request.selectedCompany ?? request.company
  if (!company) throw new Error("selectedCompany is required")

  const normalizedRequest = request.normalizedRequest
  const cacheKey = cacheKeyForDetails(company, normalizedRequest)
  const cached = getCachedDetails(cacheKey)
  if (cached) return cached

  const domain = company.domain || domainFromUrl(company.url)
  const evidence = await fetchCompanyEvidence(company, normalizedRequest)
  const links = buyingLinks(evidence)
  const availability = availabilityDetails(normalizedRequest, evidence)
  const priceRange = priceDetails(normalizedRequest, evidence, links)
  const deliveryFit = deliveryDetails(normalizedRequest, company, evidence)
  const compliance = complianceDetails(normalizedRequest, company, evidence)
  const matchedSpecifications = specificationDetails(normalizedRequest, evidence)
  const partialDetails = { availability, compliance, deliveryFit, matchedSpecifications, priceRange }
  const computedRisks = risks(normalizedRequest, company, partialDetails)
  const recommendation = overallRecommendation({ ...partialDetails, risks: computedRisks })

  const details: ProcurementCompanyDetails = {
    availability,
    buyingLinks: links,
    company: {
      domain,
      name: company.companyName || company.supplierName || company.title,
      website: originFromUrl(company.url),
    },
    compliance,
    deliveryFit,
    matchedSpecifications,
    overallRecommendation: recommendation,
    priceRange,
    risks: computedRisks,
  }

  setCachedDetails(cacheKey, details)
  return details
}

function syntheticCompanyDetails(
  company: ProcurementSupplierResult,
  request: NormalizedProcurementRequest
): ProcurementCompanyDetails {
  const evidence = [evidenceFromCompany(company)]
  const links = buyingLinks(evidence)
  const availability = availabilityDetails(request, evidence)
  const priceRange = priceDetails(request, evidence, links)
  const deliveryFit = deliveryDetails(request, company, evidence)
  const compliance = complianceDetails(request, company, evidence)
  const matchedSpecifications = specificationDetails(request, evidence)
  const partialDetails = { availability, compliance, deliveryFit, matchedSpecifications, priceRange }
  const computedRisks = risks(request, company, partialDetails)

  return {
    availability,
    buyingLinks: links,
    company: {
      domain: company.domain || domainFromUrl(company.url),
      name: company.companyName || company.supplierName || company.title,
      website: originFromUrl(company.url),
    },
    compliance,
    deliveryFit,
    matchedSpecifications,
    overallRecommendation: overallRecommendation({ ...partialDetails, risks: computedRisks }),
    priceRange,
    risks: computedRisks,
  }
}

function budgetSummary(request: NormalizedProcurementRequest) {
  if (!request.budget) return "Not specified"
  const type = request.budget.type === "per_unit" ? "per unit" : request.budget.type
  return `${request.budget.amount.toLocaleString()} ${request.budget.currency} ${type}`
}

function listOrFallback(values: string[], fallback = "Not specified") {
  return values.length ? values.join(", ") : fallback
}

function formatPriceRange(priceRange: ProcurementCompanyDetails["priceRange"]) {
  if (priceRange.status === "unknown" || priceRange.unitMin === null || priceRange.unitMax === null) {
    return priceRange.basis
  }

  return `${priceRange.unitMin.toLocaleString()}-${priceRange.unitMax.toLocaleString()} ${priceRange.currency} per unit; ${priceRange.totalMin?.toLocaleString()}-${priceRange.totalMax?.toLocaleString()} ${priceRange.currency} estimated total`
}

function quotationSections(
  request: NormalizedProcurementRequest,
  companyDetails: ProcurementCompanyDetails
): ProcurementQuoteResponse["quotation"]["sections"] {
  return [
    { label: "Selected provider", value: companyDetails.company.name },
    { label: "Requested product/resource", value: request.resourceType ?? "Not specified" },
    { label: "Quantity", value: request.quantity?.toLocaleString() ?? "Not specified" },
    { label: "Budget", value: budgetSummary(request) },
    { label: "Estimated price range", value: formatPriceRange(companyDetails.priceRange) },
    { label: "Delivery deadline", value: request.deliveryDate ?? "Not specified" },
    { label: "Delivery location", value: request.location ?? "Not specified" },
    { label: "Specifications", value: request.specifications.length ? request.specifications : ["Not specified"] },
    {
      label: "Compliance requirements",
      value: request.constraints.length
        ? request.constraints
        : [companyDetails.compliance.summary],
    },
    {
      label: "Request details",
      value:
        "Please confirm pricing, availability, delivery timing, warranty terms, compliance documentation, and quote validity.",
    },
  ]
}

function documentTextFromSections(
  title: string,
  generatedDate: string,
  sections: ProcurementQuoteResponse["quotation"]["sections"]
) {
  const lines = [
    title,
    `Generated by Procora on ${generatedDate}`,
    "",
    ...sections.flatMap((section) => [
      `${section.label}:`,
      Array.isArray(section.value)
        ? section.value.map((item) => `- ${item}`).join("\n")
        : section.value,
      "",
    ]),
  ]

  return lines.join("\n")
}

function providerEmail(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult,
  details: ProcurementCompanyDetails
) {
  const provider = company.supplierName || company.title
  const resource = request.resourceType ?? "the requested equipment"
  const subject = `Request for quotation: ${request.quantity ?? ""} ${resource}`.replace(/\s+/g, " ").trim()
  const body = [
    `Hello ${provider} team,`,
    "",
    "We would like to request a formal quotation for the procurement opportunity below.",
    "",
    `Requested resource: ${resource}`,
    `Quantity: ${request.quantity?.toLocaleString() ?? "Not specified"}`,
    `Budget: ${budgetSummary(request)}`,
    `Estimated price context: ${formatPriceRange(details.priceRange)}`,
    `Delivery deadline: ${request.deliveryDate ?? "Not specified"}`,
    `Delivery location: ${request.location ?? "Not specified"}`,
    `Specifications: ${listOrFallback(request.specifications)}`,
    `Compliance or constraints: ${listOrFallback(request.constraints, details.compliance.summary)}`,
    "",
    "Please confirm price, stock availability, delivery timing, warranty terms, compliance documentation, and quote validity period.",
    "A secure quotation submission link will be added when this RFQ is sent via Procora.",
    "",
    "Regards,",
    "Procurement team",
  ].join("\n")

  return {
    body,
    canSend: false,
    recipient: null,
    subject,
  }
}

export function generateProcurementQuote(
  request: z.infer<typeof quoteRequestSchema>
): ProcurementQuoteResponse {
  const companyDetails =
    request.companyDetails ??
    syntheticCompanyDetails(request.selectedCompany, request.normalizedRequest)

  const generatedDate = new Date().toISOString().slice(0, 10)
  const appName = "Procora"
  const title = "Request for Quotation"
  const sections = quotationSections(request.normalizedRequest, companyDetails)

  return {
    documentText: documentTextFromSections(title, generatedDate, sections),
    email: providerEmail(request.normalizedRequest, request.selectedCompany, companyDetails),
    quotation: {
      appName,
      generatedDate,
      providerCompany: companyDetails.company.name,
      sections,
      title,
    },
  }
}
