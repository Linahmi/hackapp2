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
      budgetType: "total" | "per_unit" | "unknown"
      currency?: string | null
    }
    constraints: ProcurementSearchPayloadField<string[]>
    deliveryDate: ProcurementSearchPayloadField<string>
    location: ProcurementSearchPayloadField<string>
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
    priority?: "low" | "medium" | "high"
    quantity?: number
    resourceType?: string
    specifications: string[]
  }
  queryUsed: string
  results: {
    estimatedFit: number
    matchedFields: ProcurementFieldKey[]
    snippet: string
    supplierName: string
    title: string
    url: string
    warnings: string[]
  }[]
  warnings: string[]
}
