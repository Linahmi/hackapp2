"use client"

import type { ComponentType } from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarBlank,
  Cursor,
  CaretDown,
  Circle,
  CurrencyDollar,
  GearSix,
  Hash,
  Laptop,
  Lightning,
  MagicWand,
  MapPin,
  PaperPlaneTilt,
  Plus,
  Tag,
  type IconProps,
} from "phosphor-react"
import { Select } from "@base-ui/react/select"
import type {
  ProcurementFieldKey,
  ProcurementRequirementExtraction,
} from "@/lib/procurement-extraction"

const models = [
  { name: "Gemini 2.0 Flash", id: "google" },
  { name: "Gemini 1.5 Pro", id: "google" },
] as const

type ModelName = (typeof models)[number]["name"]

const modelIcons: Record<string, string> = {
  google: "https://svgl.app/library/gemini.svg",
}

type FieldMeta = {
  Icon: ComponentType<IconProps>
  detectedClassName: string
  missingLabel: string
}

const fieldMeta: Record<ProcurementFieldKey, FieldMeta> = {
  quantity: {
    Icon: Hash,
    detectedClassName:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200",
    missingLabel: "Add quantity",
  },
  resourceType: {
    Icon: Laptop,
    detectedClassName:
      "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/25 dark:bg-purple-400/10 dark:text-purple-200",
    missingLabel: "Add resource type",
  },
  budget: {
    Icon: CurrencyDollar,
    detectedClassName:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-200",
    missingLabel: "Add budget",
  },
  deliveryDate: {
    Icon: CalendarBlank,
    detectedClassName:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-200",
    missingLabel: "Add delivery date",
  },
  location: {
    Icon: MapPin,
    detectedClassName:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200",
    missingLabel: "Add location",
  },
  specifications: {
    Icon: GearSix,
    detectedClassName:
      "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-white/15 dark:bg-white/10 dark:text-white/75",
    missingLabel: "Add specs",
  },
  priority: {
    Icon: Lightning,
    detectedClassName:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
    missingLabel: "Add priority",
  },
  constraints: {
    Icon: Tag,
    detectedClassName:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
    missingLabel: "Add constraints",
  },
}

export function AIPrompt() {
  const [input, setInput] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelName>("Gemini 2.0 Flash")
  const [extraction, setExtraction] =
    useState<ProcurementRequirementExtraction | null>(null)
  const [extractionPrompt, setExtractionPrompt] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const router = useRouter()
  const trimmedInput = input.trim()
  const currentExtraction =
    trimmedInput && extractionPrompt === trimmedInput ? extraction : null
  const completionPercentage = currentExtraction?.completionPercentage ?? 0
  const canSubmit = Boolean(trimmedInput && currentExtraction?.readyToSubmit)

  useEffect(() => {
    const trimmed = input.trim()
    setExtractionError(null)

    if (!trimmed) {
      setExtraction(null)
      setExtractionPrompt("")
      setIsExtracting(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsExtracting(true)

      try {
        const response = await fetch("/api/procurement/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: trimmed }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("Extraction failed")
        }

        const data = (await response.json()) as ProcurementRequirementExtraction

        if (controller.signal.aborted) return

        setExtraction(data)
        setExtractionPrompt(trimmed)
      } catch {
        if (controller.signal.aborted) return

        setExtraction(null)
        setExtractionPrompt("")
        setExtractionError("Requirement extraction is unavailable.")
      } finally {
        if (!controller.signal.aborted) {
          setIsExtracting(false)
        }
      }
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [input])

  const handleSubmit = () => {
    const trimmed = trimmedInput
    if (!canSubmit) return
    const id = crypto.randomUUID()
    router.push(`/search?id=${id}&q=${encodeURIComponent(trimmed)}`)
  }

  const selectedModelData = models.find((m) => m.name === selectedModel)

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      {/* Input box */}
      <div className="rounded-2xl border border-border bg-card p-4">
        {trimmedInput && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Requirement completeness</span>
              <span>
                {isExtracting && !currentExtraction
                  ? "Checking"
                  : `${completionPercentage}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Describe your procurement need — product, quantity, budget, timeline..."
          className="w-full resize-none bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[80px]"
          rows={2}
        />

        {currentExtraction && (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentExtraction.detectedFields.map((chip) => {
              const meta = fieldMeta[chip.field]
              const Icon = meta.Icon

              return (
                <span
                  key={chip.field}
                  title={`${chip.label}: ${Math.round(chip.confidence * 100)}% confidence`}
                  className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${meta.detectedClassName}`}
                >
                  <Icon size={13} weight="bold" className="shrink-0" />
                  <span className="truncate">{chip.value}</span>
                </span>
              )
            })}
            {currentExtraction.missingFields.map((field) => {
              const meta = fieldMeta[field]
              const Icon = meta.Icon

              return (
                <span
                  key={field}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-transparent px-2 text-xs font-medium text-muted-foreground"
                >
                  <Icon size={13} weight="bold" className="shrink-0 opacity-70" />
                  <span className="truncate">{meta.missingLabel}</span>
                </span>
              )
            })}
          </div>
        )}

        {currentExtraction?.followUpSuggestions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentExtraction.followUpSuggestions.map((suggestion) => (
              <span
                key={suggestion}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {suggestion}
              </span>
            ))}
          </div>
        ) : null}

        {extractionError && (
          <p className="mt-3 text-xs text-destructive">{extractionError}</p>
        )}

        <div className="flex items-center gap-1 mt-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Add attachment"
          >
            <Plus size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="AI suggestions"
          >
            <MagicWand size={18} weight="fill" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Circle tool"
          >
            <Circle size={18} weight="duotone" />
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Select tool"
          >
            <Cursor size={18} weight="bold" />
          </button>

          <div className="flex-1" />

          <Select.Root
            value={selectedModel}
            onValueChange={(value) => setSelectedModel(value as ModelName)}
          >
            <Select.Trigger className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 pr-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors outline-none">
              {selectedModelData && (
                <img src={modelIcons[selectedModelData.id]} alt="" className="h-4 w-4 model-icon" />
              )}
              <Select.Value />
              <CaretDown size={12} weight="bold" className="text-muted-foreground" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={8} align="end" className="z-10">
                <Select.Popup className="min-w-[160px] rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
                  {models.map((model) => (
                    <Select.Item
                      key={model.name}
                      value={model.name}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none cursor-default transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-foreground data-[selected]:bg-accent data-[selected]:text-foreground text-muted-foreground"
                    >
                      <img src={modelIcons[model.id]} alt="" className="h-4 w-4 model-icon" />
                      <Select.ItemText>{model.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Submit"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  )
}
