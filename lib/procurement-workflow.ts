import Exa from "exa-js"
import { z } from "zod"

import { procurementFieldSchema } from "@/lib/procurement-extraction"
import type {
  NormalizedProcurementRequest,
  ProcurementSupplierResult,
} from "@/lib/procurement-search"

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
    company: supplierResultSchema,
    normalizedRequest: normalizedRequestSchema,
    rawText: z.string().min(1).max(6000),
  })
  .strict()

const evidenceSchema = z
  .object({
    snippet: z.string(),
    title: z.string(),
    url: z.string().url(),
  })
  .strict()

const usefulLinkSchema = z
  .object({
    label: z.string(),
    type: z.enum(["source", "product", "quote", "contact", "sales"]),
    url: z.string().url(),
  })
  .strict()

export const companyDetailsResponseSchema = z
  .object({
    budgetFit: z.string(),
    company: z
      .object({
        domain: z.string(),
        name: z.string(),
        score: z.number(),
        url: z.string().url(),
      })
      .strict(),
    complianceFit: z.string(),
    deliveryFit: z.string(),
    evidence: z.array(evidenceSchema),
    matchingSpecifications: z.array(z.string()),
    priceRange: z.string(),
    productAvailability: z.string(),
    risks: z.array(z.string()),
    usefulLinks: z.array(usefulLinkSchema),
  })
  .strict()

export const quoteRequestSchema = z
  .object({
    // companyDetails is optional — when absent (user skipped the card-expand step)
    // the quote generator synthesises minimal details from selectedCompany.
    companyDetails: companyDetailsResponseSchema.nullable().optional(),
    normalizedRequest: normalizedRequestSchema,
    rawText: z.string().min(1).max(6000),
    selectedCompany: supplierResultSchema,
  })
  .strict()

export type ProcurementCompanyDetails = z.infer<
  typeof companyDetailsResponseSchema
>

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
  text?: string
  title: string | null
  url: string
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function resultSnippet(result: ExaResult) {
  const text = result.highlights?.[0] ?? result.text ?? ""
  const cleaned = normalizeText(text)
  if (cleaned.length <= 320) return cleaned
  return `${cleaned.slice(0, 317)}...`
}

function evidenceFromCompany(company: ProcurementSupplierResult) {
  return {
    snippet: company.snippet,
    title: company.title,
    url: company.url,
  }
}

function classifyLink(url: string): "source" | "product" | "quote" | "contact" | "sales" {
  const lower = url.toLowerCase()
  if (lower.includes("contact")) return "contact"
  if (lower.includes("sales")) return "sales"
  if (lower.includes("quote") || lower.includes("quotation") || lower.includes("rfq")) {
    return "quote"
  }
  if (
    lower.includes("product") ||
    lower.includes("catalog") ||
    lower.includes("shop")
  ) {
    return "product"
  }
  return "source"
}

function linkLabel(type: ReturnType<typeof classifyLink>) {
  const labels = {
    contact: "Contact page",
    product: "Product page",
    quote: "Request quote",
    sales: "Sales page",
    source: "Source page",
  }

  return labels[type]
}

function linksFromResultMetadata(company: ProcurementSupplierResult) {
  const links = company.links
  if (!links) return []

  return [
    links.quote ? { label: "Request quote", type: "quote" as const, url: links.quote } : null,
    links.contact ? { label: "Contact page", type: "contact" as const, url: links.contact } : null,
    links.product ? { label: "Product page", type: "product" as const, url: links.product } : null,
    links.website ? { label: "Company website", type: "source" as const, url: links.website } : null,
  ].filter(Boolean) as z.infer<typeof usefulLinkSchema>[]
}

function uniqueByUrl<T extends { url: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function textMatches(content: string, value: string) {
  return content.toLowerCase().includes(value.toLowerCase())
}

function complianceFit(content: string) {
  const certifications = ["iso27001", "soc2", "gdpr", "hipaa", "csa star", "pci dss"]
  const matched = certifications.filter((certification) =>
    content.toLowerCase().includes(certification)
  )

  return matched.length
    ? `Possible compliance signal found: ${matched.join(", ").toUpperCase()}. Confirm with provider.`
    : "Needs provider confirmation"
}

function productAvailability(
  request: NormalizedProcurementRequest,
  content: string
) {
  const resource = request.resourceType
  if (resource && textMatches(content, resource)) {
    return `${resource} or closely related product pages appear in the source evidence.`
  }
  if (request.specifications.some((spec) => textMatches(content, spec))) {
    return "Related technical specification evidence was found. Exact product availability needs provider confirmation."
  }
  return "Needs provider confirmation"
}

function deliveryFit(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult,
  content: string
) {
  if (request.location && textMatches(content, request.location)) {
    return `Potential fit for ${request.location}; confirm delivery SLA with provider.`
  }
  if (company.matchedFields.includes("location")) {
    return "Location matched in the original search result; delivery terms need provider confirmation."
  }
  return "Needs provider confirmation"
}

function budgetFit(
  request: NormalizedProcurementRequest,
  company: ProcurementSupplierResult
) {
  const budgetWarning = company.warnings.find((warning) =>
    warning.toLowerCase().includes("budget")
  )

  if (budgetWarning) return budgetWarning
  if (!request.budget) return "Needs provider confirmation"
  return "No explicit price found. Ask provider to confirm price and volume discount."
}

function matchingSpecifications(
  request: NormalizedProcurementRequest,
  content: string
) {
  const matches = request.specifications.filter((spec) => textMatches(content, spec))
  return matches.length ? matches : ["Needs provider confirmation"]
}

function risks(company: ProcurementSupplierResult, detailsContent: string) {
  const values = new Set(company.warnings)

  if (!detailsContent.toLowerCase().includes("quote")) {
    values.add("Quote process was not explicit in the available source preview.")
  }
  if (!detailsContent.toLowerCase().includes("delivery")) {
    values.add("Delivery timing needs provider confirmation.")
  }

  return [...values]
}

export async function getProcurementCompanyDetails(
  request: z.infer<typeof companyDetailsRequestSchema>
): Promise<ProcurementCompanyDetails> {
  const { company, normalizedRequest } = request
  const domain = company.domain || domainFromUrl(company.url)
  const evidence = [evidenceFromCompany(company)]

  const apiKey = process.env.EXA_API_KEY

  if (apiKey) {
    const exa = new Exa(apiKey)
    const query = [
      company.supplierName || company.title,
      normalizedRequest.resourceType,
      ...normalizedRequest.specifications,
      normalizedRequest.location,
      "product catalog quote contact sales delivery enterprise procurement",
    ]
      .filter(Boolean)
      .join(" ")

    try {
      const response = await exa.search(query, {
        contents: {
          highlights: {
            maxCharacters: 320,
            query,
          },
          text: {
            maxCharacters: 1200,
          },
        },
        includeDomains: [domain],
        numResults: 5,
        type: "auto",
      })

      evidence.push(
        ...(response.results as ExaResult[]).map((result) => ({
          snippet: resultSnippet(result),
          title: result.title?.trim() || domainFromUrl(result.url),
          url: result.url,
        }))
      )
    } catch (error) {
      console.error("Procurement company detail search failed", error)
    }
  }

  const uniqueEvidence = uniqueByUrl(evidence)
  const detailsContent = uniqueEvidence
    .map((item) => `${item.title} ${item.snippet} ${item.url}`)
    .join(" ")
  const usefulLinks = uniqueByUrl(
    [
      ...linksFromResultMetadata(company),
      ...uniqueEvidence.map((item) => {
        const type = classifyLink(item.url)
        return {
          label: linkLabel(type),
          type,
          url: item.url,
        }
      }),
    ]
  )

  return {
    budgetFit: budgetFit(normalizedRequest, company),
    company: {
      domain,
      name: company.companyName || company.supplierName || company.title,
      score: company.score ?? Math.round(company.estimatedFit * 100),
      url: company.url,
    },
    complianceFit: complianceFit(detailsContent),
    deliveryFit: deliveryFit(normalizedRequest, company, detailsContent),
    evidence: uniqueEvidence.slice(0, 5),
    matchingSpecifications: matchingSpecifications(normalizedRequest, detailsContent),
    priceRange: "Not found",
    productAvailability: productAvailability(normalizedRequest, detailsContent),
    risks: risks(company, detailsContent),
    usefulLinks,
  }
}

// ── Synthetic company details ──────────────────────────────────────────────────
// Built from the raw supplier search result when the user skipped the review
// card-expand step and real company details were never fetched.

function syntheticCompanyDetails(
  company: ProcurementSupplierResult,
  request: NormalizedProcurementRequest
): ProcurementCompanyDetails {
  const domain = company.domain || domainFromUrl(company.url)
  const name = company.companyName || company.supplierName || company.title
  const content = `${company.snippet} ${company.url} ${company.title}`

  return {
    budgetFit: budgetFit(request, company),
    company: {
      domain,
      name,
      score: company.score ?? Math.round(company.estimatedFit * 100),
      url: company.url,
    },
    complianceFit: complianceFit(content),
    deliveryFit: deliveryFit(request, company, content),
    evidence: [
      {
        snippet: company.snippet,
        title: company.title,
        url: company.url,
      },
    ],
    matchingSpecifications: matchingSpecifications(request, content),
    priceRange: "Not found — confirm with provider",
    productAvailability: productAvailability(request, content),
    risks: risks(company, content),
    usefulLinks: linksFromResultMetadata(company),
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

function quotationSections(
  request: NormalizedProcurementRequest,
  companyDetails: ProcurementCompanyDetails
): ProcurementQuoteResponse["quotation"]["sections"] {
  return [
    { label: "Selected provider", value: companyDetails.company.name },
    { label: "Requested product/resource", value: request.resourceType ?? "Not specified" },
    { label: "Quantity", value: request.quantity?.toLocaleString() ?? "Not specified" },
    { label: "Budget", value: budgetSummary(request) },
    { label: "Delivery deadline", value: request.deliveryDate ?? "Not specified" },
    { label: "Delivery location", value: request.location ?? "Not specified" },
    { label: "Specifications", value: request.specifications.length ? request.specifications : ["Not specified"] },
    {
      label: "Compliance requirements",
      value: request.constraints.length
        ? request.constraints
        : [companyDetails.complianceFit],
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
    "Procora is preparing a procurement request and we would like to request a formal quotation.",
    "",
    `Requested resource: ${resource}`,
    `Quantity: ${request.quantity?.toLocaleString() ?? "Not specified"}`,
    `Budget: ${budgetSummary(request)}`,
    `Delivery deadline: ${request.deliveryDate ?? "Not specified"}`,
    `Delivery location: ${request.location ?? "Not specified"}`,
    `Specifications: ${listOrFallback(request.specifications)}`,
    `Compliance or constraints: ${listOrFallback(request.constraints, details.complianceFit)}`,
    "",
    "Please confirm price, stock availability, delivery timing, warranty terms, compliance documentation, and quote validity period.",
    "",
    "Regards,",
    "Procora",
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
  // Fall back to synthetic details when the user skipped the card-expand step
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
