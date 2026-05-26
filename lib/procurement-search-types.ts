import type {
  ProcurementFieldKey,
  ProcurementRequirementExtraction,
} from "@/lib/procurement-extraction"

export function procurementSearchStorageKey(id: string) {
  return `procurement-search:${id}`
}

export type ProcurementSearchPayloadField<T> = {
  confidence: number
  required: boolean
  spanText?: string | null
  value: T
}

export type ProcurementSearchPayload = {
  completionPercentage: number
  detectedFields: ProcurementRequirementExtraction["detectedFields"]
  fields: Partial<{
    budget: ProcurementSearchPayloadField<number> & {
      amount?: number
      budgetType: "total" | "per_unit" | "unknown"
      currency?: string | null
    }
    constraints: ProcurementSearchPayloadField<string[]>
    deliveryDate: ProcurementSearchPayloadField<string>
    location: ProcurementSearchPayloadField<string> & {
      country?: string | null
      region?: string | null
      validatedBy?: string | null
    }
    priority: ProcurementSearchPayloadField<string>
    quantity: ProcurementSearchPayloadField<number>
    resourceType: ProcurementSearchPayloadField<string>
    specifications: ProcurementSearchPayloadField<string[]>
  }>
  ignoredFields: ProcurementFieldKey[]
  missingFields: ProcurementFieldKey[]
  normalizedValues: ProcurementRequirementExtraction["normalizedValues"]
  rawText: string
  readyToSubmit: boolean
  searchSettings: {
    provider: "exa"
    resultCount: number
    searchType: "auto"
  }
  selectedModel: string
}

export type ProcurementSearchResponse = {
  filtersUsed: {
    exclude: string[]
    prefer: string[]
  }
  /**
   * DB identifiers returned by the server after persisting search results.
   * Present only when the server successfully wrote to the database.
   * Used by the client to reference rows when sending RFQs.
   */
  _db?: {
    requestId: string
    suppliers: Array<{ domain: string; id: string }>
  }
  normalizedRequest: {
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
  queryUsed: string
  queryVariants?: string[]
  results: {
    companyName?: string
    domain?: string
    estimatedFit: number
    links?: {
      contact?: string
      product?: string
      quote?: string
      website: string
    }
    matchedFields: ProcurementFieldKey[]
    metricEvidence?: Record<
      string,
      {
        evidenceCount: number
        matchedSignals: string[]
        source: string
      }
    >
    metrics?: {
      budgetFit: number
      bulkFit: number
      complianceFit: number
      deliveryFit: number
      locationFit: number
      reliability: number
      resourceFit: number
      specificationFit: number
    }
    score?: number
    snippet: string
    supplierName: string
    title: string
    url: string
    warnings: string[]
  }[]
  warnings: string[]
}

export type ProcurementCompanyDetailsEvidence = {
  snippet: string
  title: string
  url: string
}

export type ProcurementCompanyDetailsLink = {
  title: string
  url: string
}

export type ProcurementCompanyDetailsRisk = {
  evidence: ProcurementCompanyDetailsEvidence[]
  message: string
  severity: "low" | "medium" | "high"
  type: "availability" | "budget" | "compliance" | "delivery" | "specification" | "supplier"
}

export type ProcurementCompanyDetailsResponse = {
  availability: {
    confidence: number
    evidence: ProcurementCompanyDetailsEvidence[]
    status: "available" | "likely_available" | "not_available" | "uncertain"
    summary: string
  }
  buyingLinks: {
    catalogPages: ProcurementCompanyDetailsLink[]
    contactPages: ProcurementCompanyDetailsLink[]
    productPages: ProcurementCompanyDetailsLink[]
    quotePages: ProcurementCompanyDetailsLink[]
  }
  company: {
    domain: string
    name: string
    website: string
  }
  compliance: {
    certifications: string[]
    confidence: number
    evidence: ProcurementCompanyDetailsEvidence[]
    status: "matched" | "partial" | "unknown"
    summary: string
  }
  deliveryFit: {
    confidence: number
    deadlineFit: "likely" | "uncertain" | "unlikely"
    evidence: ProcurementCompanyDetailsEvidence[]
    locationFit: boolean
    status: "bad" | "good" | "possible" | "uncertain"
    summary: string
  }
  matchedSpecifications: {
    confidence: number
    evidence: ProcurementCompanyDetailsEvidence[]
    matched: string[]
    missing: string[]
    status: "matched" | "not_matched" | "partial" | "uncertain"
    summary: string
  }
  overallRecommendation: {
    confidence: number
    status: "bad_fit" | "possible_fit" | "strong_fit" | "weak_fit"
    summary: string
  }
  priceRange: {
    basis: string
    confidence: number
    currency: string
    evidence: ProcurementCompanyDetailsEvidence[]
    quoteRequired: boolean
    status: "estimated" | "found" | "unknown"
    totalMax: number | null
    totalMin: number | null
    unitMax: number | null
    unitMin: number | null
  }
  risks: ProcurementCompanyDetailsRisk[]
}

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
