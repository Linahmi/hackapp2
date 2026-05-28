"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  SpinnerGap,
  Buildings,
  WarningCircle,
  Brain,
  BookOpen,
  CaretDown,
  CheckCircle,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  LinkSimple,
  PaperPlaneTilt,
  X,
  Globe,
} from "phosphor-react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Streamdown } from "streamdown"

import { ProviderListPanel, type RankedProvider } from "@/app/components/provider-list-panel"
import { PhaseTimeline, type TimelinePhase } from "@/app/components/phase-timeline"
import { useChatStore } from "@/lib/stores/chat-store"
import { useProcurementStore } from "@/lib/stores/procurement-store"
import { cn } from "@/lib/utils"
import {
  type ProcurementCompanyDetailsEvidence,
  type ProcurementCompanyDetailsLink,
  type ProcurementCompanyDetailsRisk,
  type ProcurementCompanyDetailsResponse,
  type ProcurementReceivedQuotation,
  type ProcurementQuoteResponse,
  procurementSearchStorageKey,
  type ProcurementSearchPayload,
  type ProcurementSearchResponse,
} from "@/lib/procurement-search-types"
import type { ProcurementFieldKey } from "@/lib/procurement-extraction"

type Provider = RankedProvider

// ── Sources panel ──────────────────────────────────────────────────────────────

function SourcesPanel({
  providers,
  visible,
  onClose,
  position,
  onExitComplete,
  variant = "overlay",
}: {
  providers: Provider[]
  visible: boolean
  onClose: () => void
  position?: { left: number; top: number } | null
  onExitComplete?: () => void
  variant?: "inline" | "overlay"
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Buildings size={14} weight="duotone" className="flex-shrink-0 text-primary" />
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {providers.length} providers
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X size={12} weight="bold" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {providers.map((p, i) => {
          const hostname = (() => {
            try { return new URL(p.url).hostname.replace(/^www\./, "") }
            catch { return p.url }
          })()
          return (
            <div key={`${p.url}-${i}`} className="min-w-0 px-4 py-3">
              <p className="mb-0.5 line-clamp-2 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {i + 1}. {p.name}
              </p>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-1.5 inline-flex max-w-full min-w-0 items-start gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Globe size={10} className="mt-0.5 flex-shrink-0" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {hostname} · {i + 1}
                </span>
              </a>
              <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {p.reasoning}
              </p>
            </div>
          )
        })}
      </div>
    </>
  )

  if (variant === "inline") {
    if (!visible) return null
    return (
      <motion.aside
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-24 max-h-[calc(100vh-180px)] w-full min-w-0 max-w-full overflow-hidden overflow-y-auto rounded-2xl border border-border bg-card shadow-lg"
      >
        {content}
      </motion.aside>
    )
  }

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {visible && position && (
        <motion.aside
          key="sources-panel"
          initial={{ opacity: 0, x: -16, scale: 0.98 }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
          }}
          exit={{
            opacity: 0,
            x: -16,
            scale: 0.98,
            transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
          }}
          style={{ position: "fixed", top: position.top, left: position.left }}
          className="z-50 max-h-[calc(100vh-8rem)] w-72 overflow-hidden overflow-y-auto rounded-2xl border border-border bg-card shadow-lg"
        >
          {content}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

// ── Source chips row ───────────────────────────────────────────────────────────

function SourceChips({
  providers,
  onShowAll,
}: {
  providers: Provider[]
  onShowAll: () => void
}) {
  const visible = providers.slice(0, 3)
  const rest = providers.length - visible.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <BookOpen size={14} weight="duotone" className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Sources</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {visible.map((p, i) => {
          const hostname = (() => {
            try { return new URL(p.url).hostname.replace(/^www\./, "") }
            catch { return p.url }
          })()
          return (
            <motion.a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2.5 hover:bg-accent transition-colors min-w-[140px] max-w-[200px]"
            >
              <span className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                {p.name}
              </span>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Globe size={10} />
                <span className="text-[11px] truncate">{hostname}</span>
              </div>
            </motion.a>
          )
        })}

        {rest > 0 && (
          <motion.button
            type="button"
            onClick={onShowAll}
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: visible.length * 0.05 }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted px-4 py-2.5 min-h-[64px] hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <span className="text-xs font-medium">+{rest} more</span>
          </motion.button>
        )}

        <motion.button
          type="button"
          onClick={onShowAll}
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: (visible.length + 1) * 0.05 }}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-4 py-2.5 min-h-[64px] hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <div className="flex -space-x-1.5">
            {providers.slice(0, 4).map((_, i) => (
              <div
                key={i}
                className="h-4 w-4 rounded-full bg-primary/20 border border-background ring-1 ring-border"
              />
            ))}
          </div>
          <span className="text-[11px] font-medium">Show all</span>
        </motion.button>
      </div>
    </div>
  )
}

// ── Streaming markdown reasoning ───────────────────────────────────────────────

function ReasoningSection({
  markdown,
  isStreaming,
}: {
  markdown: string
  isStreaming: boolean
}) {
  const summary = markdown
  const hasSummary = summary.trim().length > 0
  const fallback = isStreaming
    ? "Building your procurement summary..."
    : "Summary unavailable for this run."

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <Brain size={14} weight="duotone" className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Reasoning</span>
      </div>
      <div className="text-sm text-foreground/85 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
        {hasSummary ? (
          <Streamdown
            mode={isStreaming ? "streaming" : "static"}
            parseIncompleteMarkdown
          >
            {summary}
          </Streamdown>
        ) : (
          <p className="text-sm text-muted-foreground">{fallback}</p>
        )}
      </div>
    </motion.div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>

function extractFromAssistant(messages: UIMessage[]) {
  const assistant = [...messages].reverse().find((m) => m.role === "assistant")
  if (!assistant) return { providers: [] as Array<Partial<Provider> & { pending: boolean }>, markdown: "" }

  const providers: Array<Partial<Provider> & { pending: boolean }> = []
  let markdown = ""

  for (const part of assistant.parts) {
    if (part.type === "text") {
      markdown += part.text
      continue
    }
    if (part.type === "tool-addProvider") {
      const tp = part as ToolPart & { input?: Partial<Provider>; state: string }
      providers.push({
        ...(tp.input ?? {}),
        pending: tp.state !== "output-available" && tp.state !== "input-available",
      })
    }
  }

  return { providers, markdown }
}

function formatBudgetSummary(
  budget?: ProcurementSearchResponse["normalizedRequest"]["budget"]
) {
  if (!budget) return null
  const basis = budget.type === "per_unit" ? "per unit" : budget.type
  return `${budget.amount.toLocaleString()} ${budget.currency} ${basis}`
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    budget: "Budget",
    deliveryDate: "Delivery",
    location: "Location",
    priority: "Priority",
    quantity: "Quantity",
    resourceType: "Resource",
    specifications: "Specs",
  }
  return labels[field] ?? field
}

function procurementProviders(response: ProcurementSearchResponse): Provider[] {
  return response.results.map((result) => {
    const matched = result.matchedFields.map(fieldLabel).join(", ")
    const warnings = result.warnings.length
      ? ` Warnings: ${result.warnings.slice(0, 2).join(" ")}`
      : ""
    const evidenceFor = (metric: string) =>
      result.metricEvidence?.[metric]?.matchedSignals ?? []
    const metrics = result.metrics
      ? [
          { evidence: evidenceFor("resourceFit"), label: "Resource", value: result.metrics.resourceFit },
          { evidence: evidenceFor("specificationFit"), label: "Specs", value: result.metrics.specificationFit },
          { evidence: evidenceFor("locationFit"), label: "Location", value: result.metrics.locationFit },
          { evidence: evidenceFor("bulkFit"), label: "Bulk", value: result.metrics.bulkFit },
          { evidence: evidenceFor("deliveryFit"), label: "Delivery", value: result.metrics.deliveryFit },
          { evidence: evidenceFor("reliability"), label: "Reliability", value: result.metrics.reliability },
        ]
      : undefined

    return {
      matchedFields: result.matchedFields.map(fieldLabel),
      metrics,
      name: result.companyName || result.supplierName || result.title,
      reasoning: `${result.snippet || result.title}${matched ? ` Matched: ${matched}.` : ""}${warnings}`,
      score: result.score ?? Math.round(result.estimatedFit * 100),
      snippet: result.snippet || result.title,
      url: result.url,
      warnings: result.warnings,
    }
  })
}

function procurementReasoning(response: ProcurementSearchResponse) {
  const request = response.normalizedRequest
  const normalizedFields = [
    request.quantity ? `${request.quantity.toLocaleString()} units` : null,
    request.resourceType,
    request.specifications.length > 0 ? `specs: ${request.specifications.join(", ")}` : null,
    request.location ? `delivery location: ${request.location}` : null,
    request.deliveryDate ? `delivery by ${request.deliveryDate}` : null,
    request.budget
      ? `budget: ${request.budget.amount.toLocaleString()} ${request.budget.currency} ${request.budget.type}`
      : null,
    request.priority ? `priority: ${request.priority}` : null,
  ].filter(Boolean)

  const warningText = response.warnings.length
    ? `Warnings considered: ${response.warnings.join(" ")}`
    : "No request-level warnings were returned."

  return [
    `Built the supplier search from the validated procurement fields: ${normalizedFields.join("; ")}.`,
    `Generated Exa query: \`${response.queryUsed}\`.`,
    "Ranked sources by supplier/procurement relevance, product and specification matches, location signals, quantity or budget signals, and B2B supplier language.",
    warningText,
  ].join("\n\n")
}

// ── Workflow step config ───────────────────────────────────────────────────────

const procurementWorkflowSteps = [
  "Analysis",
  "Suppliers",
  "Review & Approve",
  "Send RFQs",
] as const

type ProcurementWorkflowStep = 0 | 1 | 2 | 3

// ── Shared small utils ─────────────────────────────────────────────────────────

function getInitialsLocal(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function getDomainLocal(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "") }
  catch { return url }
}

// ── Structural components ──────────────────────────────────────────────────────

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
      <SpinnerGap size={26} weight="bold" className="animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <WarningCircle size={26} weight="duotone" className="text-destructive" />
      <p className="max-w-md text-center text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function ProcurementWorkflowChrome({
  children,
  currentStep,
  heading,
  nextDisabled,
  onBack,
  onNext,
  onGoToStep,
  stepAccessible,
}: {
  children: ReactNode
  currentStep: ProcurementWorkflowStep
  heading: ReactNode
  nextDisabled: boolean
  onBack: () => void
  onNext: () => void
  onGoToStep: (step: ProcurementWorkflowStep) => void
  stepAccessible: boolean[]
}) {
  return (
    <>
      {heading}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={currentStep === 0}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label="Previous procurement step"
        >
          <ArrowLeft size={15} weight="bold" />
        </button>

        <div className="grid flex-1 gap-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            {procurementWorkflowSteps.map((step, index) => {
              const isActive = index === currentStep
              const canNavigate = stepAccessible[index] && !isActive
              return canNavigate ? (
                <button
                  key={step}
                  type="button"
                  onClick={() => onGoToStep(index as ProcurementWorkflowStep)}
                  className="hidden sm:inline font-medium text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                >
                  {index + 1}. {step}
                </button>
              ) : (
                <span
                  key={step}
                  className={isActive ? "font-semibold text-foreground" : "hidden sm:inline opacity-40"}
                >
                  {index + 1}. {step}
                </span>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            {procurementWorkflowSteps.map((_, i) => (
              <div
                key={i}
                className="h-[3px] flex-1 rounded-full transition-colors duration-300"
                style={{ background: i <= currentStep ? "var(--p-accent)" : "var(--p-border-strong)" }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || currentStep === 3}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          aria-label="Next procurement step"
        >
          <ArrowRight size={15} weight="bold" />
        </button>
      </div>

      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-8"
      >
        {children}
      </motion.div>
    </>
  )
}

// ── Step 0: Analysis ───────────────────────────────────────────────────────────

function NormalizedRequestCard({ response }: { response: ProcurementSearchResponse }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Buildings size={15} weight="duotone" className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Normalized procurement request</h2>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          Exa query from fields
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["Resource", response.normalizedRequest.resourceType],
          ["Qty", response.normalizedRequest.quantity?.toLocaleString()],
          ["Budget", formatBudgetSummary(response.normalizedRequest.budget)],
          ["Delivery", response.normalizedRequest.deliveryDate],
          ["Location", response.normalizedRequest.location],
          ["Priority", response.normalizedRequest.priority],
          ["Specs", response.normalizedRequest.specifications.join(", ")],
        ]
          .filter((item): item is [string, string] => Boolean(item[1]))
          .map(([label, value]) => (
            <span
              key={label}
              className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
            >
              <span className="font-medium text-foreground">{label}:</span> {value}
            </span>
          ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{response.queryUsed}</p>
    </section>
  )
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
      {warnings.map((warning) => (
        <div key={warning} className="flex items-start gap-2">
          <WarningCircle size={15} weight="duotone" className="mt-0.5 shrink-0 text-primary" />
          <span>{warning}</span>
        </div>
      ))}
    </section>
  )
}

function RefineForm({
  missingFields,
  onRefine,
}: {
  missingFields: ProcurementFieldKey[]
  onRefine: (values: Partial<Record<ProcurementFieldKey, string>>) => void
}) {
  const [values, setValues] = useState<Partial<Record<ProcurementFieldKey, string>>>({})
  const [open, setOpen] = useState(false)

  const actionable = missingFields.filter((f) => f !== "constraints")
  if (actionable.length === 0) return null

  const labels: Partial<Record<ProcurementFieldKey, string>> = {
    location: "Delivery location",
    priority: "Priority (urgent / standard / low)",
    deliveryDate: "Delivery timeline",
    quantity: "Quantity",
    budget: "Budget (e.g. 40000 CHF)",
    specifications: "Specifications (comma-separated)",
  }

  const hasAny = actionable.some((f) => values[f]?.trim())

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--p-border)", background: "var(--p-surface-alt)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <WarningCircle size={14} weight="duotone" className="text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground">
            Some details weren&apos;t detected —{" "}
            <span style={{ color: "var(--p-muted)" }}>
              {actionable.map((f) => labels[f] ?? f).join(", ")}
            </span>
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{open ? "Hide" : "Add details"}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {actionable.map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">{labels[field] ?? field}</label>
              <input
                type="text"
                placeholder={`Enter ${(labels[field] ?? field).toLowerCase()}…`}
                value={values[field] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={!hasAny}
              onClick={() => onRefine(values)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              Refine search
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function AnalysisStep({
  error,
  loading,
  onRefine,
  onShowSources,
  payload,
  response,
  sourceProviders,
  sourceReasoning,
}: {
  error: string | null
  loading: boolean
  onRefine: (values: Partial<Record<ProcurementFieldKey, string>>) => void
  onShowSources: () => void
  payload: ProcurementSearchPayload | null
  response: ProcurementSearchResponse | null
  sourceProviders: Provider[]
  sourceReasoning: string
}) {
  if (payload && !response && !loading && !error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Preparing structured procurement search…
      </div>
    )
  }

  if (loading) return <LoadingBlock label="Searching supplier and product sources…" />
  if (error) return <ErrorBlock message={error} />
  if (!response) return null

  const missingFields = (payload?.missingFields ?? []) as ProcurementFieldKey[]

  return (
    <>
      {sourceProviders.length > 0 && (
        <SourceChips providers={sourceProviders} onShowAll={onShowSources} />
      )}
      <ReasoningSection markdown={sourceReasoning} isStreaming={false} />
      <NormalizedRequestCard response={response} />
      <WarningsList warnings={response.warnings} />
      <RefineForm missingFields={missingFields} onRefine={onRefine} />
    </>
  )
}

// ── Step 1: Suppliers (multi-select) ──────────────────────────────────────────

function CompaniesStep({
  onToggleCompany,
  providers,
  selectedIndices,
}: {
  onToggleCompany: (provider: Provider, index: number) => void
  providers: Provider[]
  selectedIndices: number[]
}) {
  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No supplier results were returned for this structured request.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Matching suppliers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select one or more suppliers to include in your RFQ campaign.
          </p>
        </div>
        {selectedIndices.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: "color-mix(in oklab, var(--p-accent), transparent 90%)",
              color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 12%)",
              border: "1px solid color-mix(in oklab, var(--p-accent), transparent 68%)",
            }}
          >
            <CheckCircle size={13} weight="fill" />
            {selectedIndices.length} selected
          </span>
        )}
      </div>

      <ProviderListPanel
        defaultExpandedFirst={false}
        multiSelect
        onSelect={onToggleCompany}
        providers={providers}
        selectedIndices={selectedIndices}
      />

      {selectedIndices.length === 0 && providers.length > 0 && (
        <p className="text-center text-xs py-1" style={{ color: "var(--p-muted)" }}>
          Select at least one supplier to continue
        </p>
      )}
    </section>
  )
}

// ── Step 2: Review & Approve ───────────────────────────────────────────────────

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="min-w-0 max-w-full text-sm leading-relaxed text-foreground/85">{value}</div>
    </div>
  )
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ")
}

function percentLabel(value: number) {
  return `${Math.round(value * 100)}% confidence`
}

function DetailStatusBadge({ status }: { status: string }) {
  const positive = new Set(["available", "found", "good", "matched", "strong_fit"])
  const inferred = new Set(["likely_available", "estimated", "possible", "partial", "possible_fit"])
  const isPositive = positive.has(status)
  const isInferred = inferred.has(status)

  return (
    <span
      className="inline-flex max-w-full flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{
        background: isPositive || isInferred
          ? "color-mix(in oklab, var(--p-accent), transparent 90%)"
          : "var(--p-surface-alt)",
        border: isPositive || isInferred
          ? "1px solid color-mix(in oklab, var(--p-accent), transparent 72%)"
          : "1px solid var(--p-border)",
        color: isPositive
          ? "color-mix(in oklab, var(--p-accent), var(--p-ink) 8%)"
          : isInferred
            ? "color-mix(in oklab, var(--p-accent), var(--p-muted) 28%)"
            : "var(--p-muted)",
      }}
    >
      {statusLabel(status)}
    </span>
  )
}

function EvidenceCard({ item }: { item: ProcurementCompanyDetailsEvidence }) {
  const domain = getDomainLocal(item.url)

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30"
    >
      <span className="block min-w-0 max-w-full whitespace-normal break-words text-xs font-medium leading-snug text-foreground line-clamp-2 [overflow-wrap:anywhere] group-hover:text-primary">
        {item.title || domain}
      </span>
      <span className="mt-1 block min-w-0 max-w-full whitespace-normal break-words text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
        {domain}
      </span>
      <span className="mt-1.5 block min-w-0 max-w-full whitespace-normal break-words text-[11px] leading-relaxed text-muted-foreground line-clamp-3 [overflow-wrap:anywhere]">
        {item.snippet || item.url}
      </span>
      <span className="mt-2 inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-primary">
        <LinkSimple size={10} className="flex-shrink-0" />
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">Open source</span>
      </span>
    </a>
  )
}

function normalizedEvidenceKey(item: ProcurementCompanyDetailsEvidence) {
  try {
    const url = new URL(item.url)
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return item.url.trim().replace(/\/$/, "")
  }
}

function uniqueEvidenceItems(evidence: ProcurementCompanyDetailsEvidence[]) {
  const seen = new Set<string>()

  return evidence.filter((item) => {
    const key = normalizedEvidenceKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function EvidenceList({
  evidence,
  initialCount = 3,
}: {
  evidence: ProcurementCompanyDetailsEvidence[]
  initialCount?: number
}) {
  const uniqueEvidence = uniqueEvidenceItems(evidence)
  const visibleEvidence = uniqueEvidence.slice(0, initialCount)
  const hiddenEvidence = uniqueEvidence.slice(initialCount)

  return (
    <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
      {visibleEvidence.map((item, index) => (
        <EvidenceCard key={`${normalizedEvidenceKey(item)}-${index}`} item={item} />
      ))}
      {hiddenEvidence.length > 0 && (
        <details className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-dashed border-border bg-background/30 px-3 py-2">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
            Show more evidence ({hiddenEvidence.length})
          </summary>
          <div className="mt-2 grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
            {hiddenEvidence.map((item, index) => (
              <EvidenceCard key={`${normalizedEvidenceKey(item)}-${index + initialCount}`} item={item} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function EvidenceDisclosure({
  evidence,
}: {
  evidence: ProcurementCompanyDetailsEvidence[]
}) {
  if (evidence.length === 0) return null

  return (
    <details className="mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-background/40 px-3 py-2">
      <summary className="cursor-pointer select-none break-words text-[11px] font-medium text-muted-foreground [overflow-wrap:anywhere]">
        Evidence ({evidence.length})
      </summary>
      <div className="mt-2 w-full min-w-0 max-w-full overflow-hidden">
        <EvidenceList evidence={evidence} />
      </div>
    </details>
  )
}

function DetailSection({
  children,
  confidence,
  evidence,
  label,
  status,
}: {
  children: ReactNode
  confidence: number
  evidence: ProcurementCompanyDetailsEvidence[]
  label: string
  status: string
}) {
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 break-words text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [overflow-wrap:anywhere]">
          {label}
        </p>
        <DetailStatusBadge status={status} />
      </div>
      <div className="min-w-0 max-w-full break-words text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
        {children}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{percentLabel(confidence)}</p>
      <EvidenceDisclosure evidence={evidence} />
    </section>
  )
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return null
  return `${value.toLocaleString()} ${currency}`
}

function PriceRangeSummary({
  priceRange,
}: {
  priceRange: ProcurementCompanyDetailsResponse["priceRange"]
}) {
  const unit =
    priceRange.unitMin !== null && priceRange.unitMax !== null
      ? `${formatMoney(priceRange.unitMin, priceRange.currency)}–${formatMoney(priceRange.unitMax, priceRange.currency)} per unit`
      : null
  const total =
    priceRange.totalMin !== null && priceRange.totalMax !== null
      ? `${formatMoney(priceRange.totalMin, priceRange.currency)}–${formatMoney(priceRange.totalMax, priceRange.currency)} total`
      : null

  return (
    <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
      {unit || total ? (
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          {unit && <span className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs break-words [overflow-wrap:anywhere]">{unit}</span>}
          {total && <span className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs break-words [overflow-wrap:anywhere]">{total}</span>}
          {priceRange.quoteRequired && (
            <span className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
              quote required
            </span>
          )}
        </div>
      ) : null}
      <p>{priceRange.basis}</p>
    </div>
  )
}

function SpecificationSummary({
  details,
}: {
  details: ProcurementCompanyDetailsResponse["matchedSpecifications"]
}) {
  return (
    <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
      <p>{details.summary}</p>
      {(details.matched.length > 0 || details.missing.length > 0) && (
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          {details.matched.map((item) => (
            <span
              key={`matched-${item}`}
              className="min-w-0 max-w-full rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs text-primary break-words [overflow-wrap:anywhere]"
            >
              {item}
            </span>
          ))}
          {details.missing.map((item) => (
            <span
              key={`missing-${item}`}
              className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]"
            >
              Missing: {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function BuyingLinkGroup({
  label,
  links,
}: {
  label: string
  links: ProcurementCompanyDetailsLink[]
}) {
  if (links.length === 0) return null

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 max-w-full items-start gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <LinkSimple size={10} className="mt-0.5 flex-shrink-0" />
            <span className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
              {link.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function BuyingLinksSection({
  links,
}: {
  links: ProcurementCompanyDetailsResponse["buyingLinks"]
}) {
  const hasLinks = Object.values(links).some((items) => items.length > 0)
  if (!hasLinks) {
    return (
      <DetailItem
        label="Buying/contact links"
        value={<span className="text-muted-foreground">No useful supplier links were discovered.</span>}
      />
    )
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Buying &amp; contact links
      </p>
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden">
        <BuyingLinkGroup label="Products" links={links.productPages} />
        <BuyingLinkGroup label="Quotes" links={links.quotePages} />
        <BuyingLinkGroup label="Contact" links={links.contactPages} />
        <BuyingLinkGroup label="Catalogs" links={links.catalogPages} />
      </div>
    </section>
  )
}

function RisksSection({
  risks,
}: {
  risks: ProcurementCompanyDetailsRisk[]
}) {
  if (risks.length === 0) return null

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Risks
      </p>
      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden">
        {risks.map((risk, i) => (
          <div key={i} className="min-w-0 max-w-full overflow-hidden">
            <div className="mb-1 flex min-w-0 max-w-full items-center gap-2">
              <DetailStatusBadge status={risk.severity} />
              <span className="min-w-0 max-w-full break-words text-xs text-foreground [overflow-wrap:anywhere]">
                {risk.message}
              </span>
            </div>
            <EvidenceDisclosure evidence={risk.evidence} />
          </div>
        ))}
      </div>
    </section>
  )
}

function SupplierReviewCard({
  approved,
  details,
  error,
  expanded,
  loading,
  onExpand,
  onToggleApproval,
  provider,
}: {
  approved: boolean
  details: ProcurementCompanyDetailsResponse | null
  error: string | null
  expanded: boolean
  loading: boolean
  onExpand: () => void
  onToggleApproval: () => void
  provider: Provider & { domain: string }
}) {
  return (
    <article
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        border: `1px solid ${
          approved
            ? "color-mix(in oklab, var(--p-accent), transparent 55%)"
            : "var(--p-border)"
        }`,
        background: approved
          ? "color-mix(in oklab, white, var(--p-accent) 2.5%)"
          : "var(--p-surface)",
        boxShadow: "var(--p-shadow-card)",
      }}
    >
      {/* Compact header */}
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Logo initials */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
          style={{
            background: "color-mix(in oklab, var(--p-accent), var(--p-surface) 88%)",
            color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 20%)",
            border: "1px solid color-mix(in oklab, var(--p-accent), transparent 76%)",
          }}
        >
          {getInitialsLocal(provider.name)}
        </div>

        {/* Name + domain */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug truncate" style={{ color: "var(--p-ink)" }}>
            {provider.name}
          </p>
          <p className="text-xs leading-snug truncate" style={{ color: "var(--p-muted)" }}>
            {provider.domain}
          </p>
        </div>

        {/* Score pill */}
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: "color-mix(in oklab, var(--p-accent), var(--p-surface) 90%)",
            color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 10%)",
            border: "1px solid color-mix(in oklab, var(--p-accent), transparent 72%)",
          }}
        >
          {provider.score} match
        </span>

        {/* RFQ approval toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleApproval() }}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
          style={
            approved
              ? {
                  background: "color-mix(in oklab, var(--p-accent), transparent 88%)",
                  color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 8%)",
                  border: "1px solid color-mix(in oklab, var(--p-accent), transparent 58%)",
                }
              : {
                  background: "transparent",
                  color: "var(--p-muted)",
                  border: "1px solid var(--p-border)",
                }
          }
        >
          {approved ? (
            <>
              <CheckCircle size={13} weight="fill" />
              Include in RFQ
            </>
          ) : (
            <>
              <span
                className="w-[13px] h-[13px] rounded-full border-2 flex-shrink-0"
                style={{ borderColor: "var(--p-faint)" }}
              />
              Excluded
            </>
          )}
        </button>

        {/* Expand chevron */}
        <button
          type="button"
          onClick={onExpand}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          <CaretDown
            size={12}
            weight="bold"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 180ms ease",
            }}
          />
        </button>
      </div>

      {/* Snippet row */}
      <div className="px-4 pb-3.5 -mt-1">
        <div className="flex min-w-0 max-w-full gap-3 overflow-hidden">
          <div className="w-9 flex-shrink-0" />
          <p className="min-w-0 max-w-full break-words text-xs leading-relaxed line-clamp-2 [overflow-wrap:anywhere]" style={{ color: "var(--p-ink-2)" }}>
            {provider.snippet || provider.reasoning}
          </p>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="min-w-0 max-w-full overflow-hidden" style={{ borderTop: "1px solid var(--p-border)" }}>
          {loading && (
            <div className="px-4 py-5">
              <div className="mb-4 flex items-center gap-2.5 text-muted-foreground">
                <SpinnerGap size={16} weight="bold" className="animate-spin text-primary flex-shrink-0" />
                <span className="text-sm">Fetching supplier evidence…</span>
              </div>
              <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-28 rounded-2xl border border-border bg-muted/30 animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-4 flex items-center gap-2 text-sm" style={{ color: "var(--p-rose)" }}>
              <WarningCircle size={15} weight="duotone" className="flex-shrink-0" />
              {error}
            </div>
          )}

          {details && !loading && (
            <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden p-4">
              <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[repeat(2,minmax(0,1fr))]">
                <DetailSection
                  confidence={details.availability.confidence}
                  evidence={details.availability.evidence}
                  label="Availability"
                  status={details.availability.status}
                >
                  {details.availability.summary}
                </DetailSection>

                <DetailSection
                  confidence={details.priceRange.confidence}
                  evidence={details.priceRange.evidence}
                  label="Price range"
                  status={details.priceRange.status}
                >
                  <PriceRangeSummary priceRange={details.priceRange} />
                </DetailSection>

                <DetailSection
                  confidence={details.deliveryFit.confidence}
                  evidence={details.deliveryFit.evidence}
                  label="Delivery fit"
                  status={details.deliveryFit.status}
                >
                  <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
                    <p>{details.deliveryFit.summary}</p>
                    <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                      <span className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs break-words [overflow-wrap:anywhere]">
                        Location {details.deliveryFit.locationFit ? "matched" : "uncertain"}
                      </span>
                      <span className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs break-words [overflow-wrap:anywhere]">
                        Deadline {details.deliveryFit.deadlineFit}
                      </span>
                    </div>
                  </div>
                </DetailSection>

                <DetailSection
                  confidence={details.compliance.confidence}
                  evidence={details.compliance.evidence}
                  label="Compliance"
                  status={details.compliance.status}
                >
                  <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden">
                    <p>{details.compliance.summary}</p>
                    {details.compliance.certifications.length > 0 && (
                      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                        {details.compliance.certifications.map((certification) => (
                          <span
                            key={certification}
                            className="min-w-0 max-w-full rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]"
                          >
                            {certification}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </DetailSection>
              </div>

              <DetailSection
                confidence={details.matchedSpecifications.confidence}
                evidence={details.matchedSpecifications.evidence}
                label="Matched specifications"
                status={details.matchedSpecifications.status}
              >
                <SpecificationSummary details={details.matchedSpecifications} />
              </DetailSection>

              <BuyingLinksSection links={details.buyingLinks} />
              <RisksSection risks={details.risks} />

              <DetailSection
                confidence={details.overallRecommendation.confidence}
                evidence={[]}
                label="Overall recommendation"
                status={details.overallRecommendation.status}
              >
                {details.overallRecommendation.summary}
              </DetailSection>
            </div>
          )}

          {!details && !loading && !error && (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              No details available yet.
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function RFQSummaryPanel({
  approvedIndices,
  onContinue,
  providers,
  selectedIndices,
}: {
  approvedIndices: number[]
  onContinue: () => void
  providers: Provider[]
  selectedIndices: number[]
}) {
  const approved = approvedIndices.map((i) => providers[i]).filter(Boolean)
  const excluded = selectedIndices
    .filter((i) => !approvedIndices.includes(i))
    .map((i) => providers[i])
    .filter(Boolean)

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-4"
      style={{
        border: "1px solid var(--p-border)",
        background: "var(--p-surface)",
        boxShadow: "var(--p-shadow-card)",
      }}
    >
      <div>
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-3"
          style={{ color: "var(--p-muted)" }}
        >
          RFQ Campaign
        </p>
        <div className="flex gap-4">
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-2xl font-bold" style={{ color: "var(--p-ink)" }}>
              {approved.length}
            </span>
            <span className="text-[11px]" style={{ color: "var(--p-muted)" }}>Approved</span>
          </div>
          {excluded.length > 0 && (
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-2xl font-bold" style={{ color: "var(--p-faint)" }}>
                {excluded.length}
              </span>
              <span className="text-[11px]" style={{ color: "var(--p-muted)" }}>Excluded</span>
            </div>
          )}
        </div>
      </div>

      {approved.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--p-muted)" }}
          >
            Included
          </p>
          {approved.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <CheckCircle
                size={12}
                weight="fill"
                style={{ color: "var(--p-accent)", flexShrink: 0 }}
              />
              <span className="text-xs truncate" style={{ color: "var(--p-ink)" }}>
                {p?.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {excluded.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--p-muted)" }}
          >
            Excluded
          </p>
          {excluded.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <X size={11} weight="bold" style={{ color: "var(--p-faint)", flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: "var(--p-muted)" }}>
                {p?.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={approved.length === 0}
        onClick={onContinue}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        style={{ background: "var(--p-accent)", color: "white" }}
      >
        Send RFQs
        <ArrowRight size={14} weight="bold" />
      </button>
    </div>
  )
}

function ReviewAndApproveStep({
  approvedIndices,
  companyDetailsErrorMap,
  companyDetailsLoadingSet,
  companyDetailsMap,
  expandedIndex,
  onContinue,
  onExpandCard,
  onToggleApproval,
  providers,
  selectedIndices,
}: {
  approvedIndices: number[]
  companyDetailsErrorMap: Record<number, string>
  companyDetailsLoadingSet: number[]
  companyDetailsMap: Record<number, ProcurementCompanyDetailsResponse>
  expandedIndex: number | null
  onContinue: () => void
  onExpandCard: (index: number) => void
  onToggleApproval: (index: number) => void
  providers: Provider[]
  selectedIndices: number[]
}) {
  const hydratedProviders = useMemo(
    () =>
      providers.map((p) => ({
        ...p,
        domain: getDomainLocal(p.url),
      })),
    [providers]
  )

  if (selectedIndices.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No suppliers were selected. Go back and select at least one supplier.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Review &amp; Approve Suppliers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Validate each supplier before sending RFQs. Expand a card to see detailed information.
        </p>
      </div>

      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_170px] lg:items-start">
        <div className="flex w-full min-w-0 max-w-none flex-col gap-3 overflow-hidden">
          {selectedIndices.map((idx) => {
            const provider = hydratedProviders[idx]
            if (!provider) return null
            return (
              <SupplierReviewCard
                key={idx}
                approved={approvedIndices.includes(idx)}
                details={companyDetailsMap[idx] ?? null}
                error={companyDetailsErrorMap[idx] ?? null}
                expanded={expandedIndex === idx}
                loading={companyDetailsLoadingSet.includes(idx)}
                onExpand={() => onExpandCard(idx)}
                onToggleApproval={() => onToggleApproval(idx)}
                provider={provider}
              />
            )
          })}
        </div>

        <div className="w-full min-w-0 flex-shrink-0 xl:sticky xl:top-24 xl:self-start">
          <RFQSummaryPanel
            approvedIndices={approvedIndices}
            onContinue={onContinue}
            providers={providers}
            selectedIndices={selectedIndices}
          />
        </div>

      </div>
    </section>
  )
}

// ── Step 3: Send RFQs ──────────────────────────────────────────────────────────

function downloadDocument(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function SupplierQuoteCard({
  error,
  loading,
  provider,
  quote,
  rfqSendState,
}: {
  error: string | null
  loading: boolean
  provider: Provider
  quote: ProcurementQuoteResponse | null
  rfqSendState?: RfqSendState
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3 text-muted-foreground">
        <SpinnerGap size={20} weight="bold" className="animate-spin text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Generating RFQ…</p>
          <p className="text-xs text-muted-foreground mt-0.5">{provider?.name}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3">
        <WarningCircle size={20} weight="duotone" className="text-destructive flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">{provider?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
        </div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        RFQ not yet generated.
      </div>
    )
  }

  const mailtoUrl = quote.email.recipient
    ? `mailto:${quote.email.recipient}?subject=${encodeURIComponent(
        quote.email.subject
      )}&body=${encodeURIComponent(quote.email.body)}`
    : null

  return (
    <div className="flex flex-col gap-5">
      {/* Quotation document */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {quote.quotation.appName}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{quote.quotation.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated {quote.quotation.generatedDate}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadDocument(
                `rfq-${quote.quotation.providerCompany.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`,
                quote.documentText
              )
            }
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <DownloadSimple size={15} />
            Download
          </button>
        </div>

        <div className="grid gap-3">
          {quote.quotation.sections.map((section) => (
            <div key={section.label} className="rounded-xl border border-border/70 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section.label}
              </p>
              {Array.isArray(section.value) ? (
                <ul className="grid gap-1 pl-4 text-sm text-foreground/85">
                  {section.value.map((item) => (
                    <li key={`${section.label}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground/85">{section.value}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Provider email */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <EnvelopeSimple size={16} weight="duotone" className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Provider email</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(quote.email.body)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Copy size={13} />
              Copy email
            </button>
            {mailtoUrl ? (
              <a
                href={mailtoUrl}
                className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary"
              >
                Send email
              </a>
            ) : null}

            {/* Procora send state badge */}
            {rfqSendState?.status === "sent" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "color-mix(in oklab, var(--p-accent), transparent 55%)", background: "color-mix(in oklab, var(--p-accent), transparent 90%)", color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 10%)" }}>
                <PaperPlaneTilt size={12} weight="fill" />
                Sent via Procora
              </span>
            )}
            {rfqSendState?.status === "sending" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                <SpinnerGap size={12} weight="bold" className="animate-spin" />
                Sending…
              </span>
            )}
            {rfqSendState?.status === "failed" && (
              <span
                title={rfqSendState.error}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "color-mix(in oklab, var(--p-rose), transparent 55%)", background: "color-mix(in oklab, var(--p-rose), transparent 90%)", color: "var(--p-rose)" }}
              >
                <WarningCircle size={12} weight="duotone" />
                Send failed
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Recipient: </span>
            <span className="text-foreground">{quote.email.recipient ?? "Not found"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Subject: </span>
            <span className="text-foreground">{quote.email.subject}</span>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground/85">
            {quote.email.body}
          </pre>
          {!quote.email.canSend && (
            <p className="text-xs text-muted-foreground">
              No provider email address was found. Use the generated email with the provider contact
              form or copy it into your mail client.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Procora send panel ─────────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return v.includes("@") && v.includes(".") && v.trim().length > 4
}

function ProcoraPanel({
  approvedIndices,
  campaignSending,
  dbMeta,
  manualEmails,
  onManualEmailChange,
  onSend,
  providers,
  quotationsErrorMap,
  quotationsLoadingSet,
  quotationsMap,
  rfqSendStates,
}: {
  approvedIndices: number[]
  campaignSending: boolean
  dbMeta: ProcurementSearchResponse["_db"] | undefined
  manualEmails: Record<number, string>
  onManualEmailChange: (idx: number, email: string) => void
  onSend: () => void
  providers: Provider[]
  quotationsErrorMap: Record<number, string>
  quotationsLoadingSet: number[]
  quotationsMap: Record<number, ProcurementQuoteResponse>
  rfqSendStates: Record<number, RfqSendState>
}) {
  // Only show when DB identifiers are available (DB persistence succeeded)
  if (!dbMeta) return null

  // Wait until every approved quote has finished loading or errored
  const allQuotesDone =
    approvedIndices.length > 0 &&
    approvedIndices.every((idx) => quotationsMap[idx] || quotationsErrorMap[idx]) &&
    quotationsLoadingSet.length === 0

  if (!allQuotesDone) return null

  // Build per-supplier rows — only those with a DB id can be sent
  const rows = approvedIndices.map((idx) => {
    const supplierId = dbMeta.suppliers[idx]?.id
    const quote = quotationsMap[idx]
    const detectedEmail = quote?.email?.canSend ? (quote.email.recipient ?? null) : null
    const manualEmail = manualEmails[idx]?.trim() ?? ""
    const effectiveEmail = detectedEmail ?? (isValidEmail(manualEmail) ? manualEmail : null)
    const sendState = rfqSendStates[idx]
    return { idx, supplierId, detectedEmail, manualEmail, effectiveEmail, sendState }
  })

  // Suppliers we can actually send to (have DB id + at least one valid email)
  const sendableRows = rows.filter((r) => r.supplierId && r.effectiveEmail)

  const sentCount = rows.filter((r) => r.sendState?.status === "sent").length
  const failedCount = rows.filter((r) => r.sendState?.status === "failed").length
  const allSent = sentCount > 0 && sentCount === sendableRows.length && sendableRows.length > 0
  const anySent = sentCount > 0 || failedCount > 0

  if (allSent) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          border: "1px solid color-mix(in oklab, var(--p-accent), transparent 55%)",
          background: "color-mix(in oklab, var(--p-accent), transparent 90%)",
        }}
      >
        <CheckCircle size={18} weight="fill" style={{ color: "var(--p-accent)", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 10%)" }}>
            Campaign sent via Procora
          </p>
          <p className="text-xs mt-0.5" style={{ color: "color-mix(in oklab, var(--p-accent), var(--p-ink) 30%)" }}>
            {sentCount} RFQ{sentCount !== 1 ? "s" : ""} queued for delivery
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl px-4 py-4"
      style={{ border: "1px solid var(--p-border)", background: "var(--p-surface)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <EnvelopeSimple size={15} weight="duotone" className="text-primary flex-shrink-0" />
          <p className="text-sm font-semibold" style={{ color: "var(--p-ink)" }}>
            {anySent ? "Resend campaign via Procora" : "Send campaign via Procora"}
          </p>
        </div>
        <button
          type="button"
          disabled={campaignSending || sendableRows.length === 0}
          onClick={onSend}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          style={{ background: "var(--p-accent)", color: "white" }}
        >
          {campaignSending ? (
            <>
              <SpinnerGap size={12} weight="bold" className="animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <PaperPlaneTilt size={12} weight="bold" />
              Send {sendableRows.length} RFQ{sendableRows.length !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </div>

      {/* Per-supplier rows */}
      <div className="flex flex-col gap-1.5">
        {rows.map(({ idx, supplierId, detectedEmail, manualEmail, effectiveEmail, sendState }) => {
          const name = providers[idx]?.name ?? `Supplier ${idx + 1}`
          const isSent = sendState?.status === "sent"
          const isFailed = sendState?.status === "failed"

          return (
            <div key={idx} className="flex items-center gap-2.5 min-w-0">
              {/* Status dot */}
              {isSent && (
                <PaperPlaneTilt size={13} weight="fill" className="flex-shrink-0" style={{ color: "var(--p-accent)" }} />
              )}
              {isFailed && (
                <WarningCircle size={13} weight="duotone" className="flex-shrink-0" style={{ color: "var(--p-rose)" }} />
              )}
              {!isSent && !isFailed && effectiveEmail && (
                <CheckCircle size={13} weight="fill" className="flex-shrink-0" style={{ color: "var(--p-accent)" }} />
              )}
              {!isSent && !isFailed && !effectiveEmail && (
                <span
                  className="w-[13px] h-[13px] rounded-full flex-shrink-0 border-2"
                  style={{ borderColor: "var(--p-faint)" }}
                />
              )}

              {/* Supplier name */}
              <span
                className="text-xs font-medium flex-shrink-0 w-28 truncate"
                style={{ color: isSent ? "var(--p-accent)" : "var(--p-ink)" }}
              >
                {name}
              </span>

              {/* Email — detected (read-only) or manual input */}
              {detectedEmail ? (
                <span className="text-xs truncate min-w-0" style={{ color: "var(--p-muted)" }}>
                  {detectedEmail}
                </span>
              ) : !supplierId ? (
                <span className="text-xs italic" style={{ color: "var(--p-faint)" }}>
                  unavailable
                </span>
              ) : isSent ? (
                <span className="text-xs truncate min-w-0" style={{ color: "var(--p-muted)" }}>
                  {manualEmail}
                </span>
              ) : (
                <input
                  type="email"
                  placeholder="Enter supplier email…"
                  value={manualEmail}
                  disabled={campaignSending}
                  onChange={(e) => onManualEmailChange(idx, e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              )}

              {/* Failure note */}
              {isFailed && sendState.status === "failed" && (
                <span className="text-[11px] truncate flex-shrink-0" style={{ color: "var(--p-rose)" }}>
                  {sendState.error}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer hint */}
      {sendableRows.length === 0 && (
        <p className="text-xs" style={{ color: "var(--p-muted)" }}>
          Enter at least one supplier email above to enable sending.
        </p>
      )}
      {sendableRows.length > 0 && sendableRows.length < rows.filter(r => r.supplierId).length && (
        <p className="text-xs" style={{ color: "var(--p-muted)" }}>
          Suppliers without an email will be skipped.
        </p>
      )}
    </div>
  )
}

// ── Step 3: Send RFQs (multi-supplier view) ────────────────────────────────────

function ReceivedQuotationsSection({
  error,
  loading,
  onRefresh,
  quotations,
  requestId,
}: {
  error: string | null
  loading: boolean
  onRefresh: () => void
  quotations: ProcurementReceivedQuotation[]
  requestId: string | undefined
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Received quotations</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Real supplier submissions linked to this RFQ campaign.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quotations.length >= 1 && requestId && (
            <a
              href={`/requests/${requestId}/compare`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--p-accent)",
                color: "white",
              }}
            >
              {quotations.length === 1 ? "View quotation →" : "Compare quotations →"}
            </a>
          )}
          {requestId && (
            <a
              href={`/requests/${requestId}/export`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              Export workflow
            </a>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {loading ? <SpinnerGap size={12} weight="bold" className="animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {quotations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No supplier quotations received yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Unit price</th>
                <th className="px-3 py-2 font-medium">Total price</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium">Lead time</th>
                <th className="px-3 py-2 font-medium">MOQ</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => (
                <tr key={quotation.id} className="border-b border-border/60 align-top">
                  <td className="px-3 py-3 text-foreground">
                    <div className="font-medium">{quotation.supplierName}</div>
                    <div className="text-xs text-muted-foreground">
                      {quotation.submittedBy}
                      {quotation.submittedRole ? `, ${quotation.submittedRole}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-foreground">{quotation.unitPrice}</td>
                  <td className="px-3 py-3 text-foreground">{quotation.totalPrice}</td>
                  <td className="px-3 py-3 text-foreground">{quotation.currency}</td>
                  <td className="px-3 py-3 text-foreground">
                    {quotation.leadTimeDays !== null ? `${quotation.leadTimeDays} days` : "—"}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    {quotation.moq !== null ? quotation.moq.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    {new Date(quotation.submittedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-foreground">{quotation.status}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {quotation.notes?.trim() || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function MultiRFQStep({
  approvedIndices,
  campaignSending,
  dbMeta,
  manualEmails,
  onRefreshQuotations,
  onManualEmailChange,
  onSendCampaign,
  providers,
  receivedQuotations,
  receivedQuotationsError,
  receivedQuotationsLoading,
  quotationsErrorMap,
  quotationsLoadingSet,
  quotationsMap,
  rfqSendStates,
}: {
  approvedIndices: number[]
  campaignSending: boolean
  dbMeta: ProcurementSearchResponse["_db"] | undefined
  manualEmails: Record<number, string>
  onRefreshQuotations: () => void
  onManualEmailChange: (idx: number, email: string) => void
  onSendCampaign: () => void
  providers: Provider[]
  receivedQuotations: ProcurementReceivedQuotation[]
  receivedQuotationsError: string | null
  receivedQuotationsLoading: boolean
  quotationsErrorMap: Record<number, string>
  quotationsLoadingSet: number[]
  quotationsMap: Record<number, ProcurementQuoteResponse>
  rfqSendStates: Record<number, RfqSendState>
}) {
  // Derive active tab index: prefer the current selection, fall back to first approved.
  // Computed directly — no synchronised state needed here.
  const [_activeIndex, setActiveIndex] = useState<number | null>(
    approvedIndices[0] ?? null
  )
  const activeIndex = _activeIndex !== null && approvedIndices.includes(_activeIndex)
    ? _activeIndex
    : (approvedIndices[0] ?? null)

  if (approvedIndices.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No suppliers were approved for RFQ. Go back and approve at least one supplier.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">RFQ Campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {approvedIndices.length} supplier{approvedIndices.length !== 1 ? "s" : ""} included ·
          Review each RFQ before sending.
        </p>
      </div>

      {/* Procora send panel — appears once all quotes are ready */}
      <ProcoraPanel
        approvedIndices={approvedIndices}
        campaignSending={campaignSending}
        dbMeta={dbMeta}
        manualEmails={manualEmails}
        onManualEmailChange={onManualEmailChange}
        onSend={onSendCampaign}
        providers={providers}
        quotationsErrorMap={quotationsErrorMap}
        quotationsLoadingSet={quotationsLoadingSet}
        quotationsMap={quotationsMap}
        rfqSendStates={rfqSendStates}
      />

      <ReceivedQuotationsSection
        error={receivedQuotationsError}
        loading={receivedQuotationsLoading}
        onRefresh={onRefreshQuotations}
        quotations={receivedQuotations}
        requestId={dbMeta?.requestId}
      />

      {/* Supplier tab switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {approvedIndices.map((idx) => {
          const p = providers[idx]
          if (!p) return null
          const isLoading = quotationsLoadingSet.includes(idx)
          const isDone = Boolean(quotationsMap[idx])
          const hasError = Boolean(quotationsErrorMap[idx])
          const isActive = activeIndex === idx
          const sendState = rfqSendStates[idx]
          const isSent = sendState?.status === "sent"
          const isSendFailed = sendState?.status === "failed"

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className="flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium transition-all"
              style={
                isActive
                  ? { background: "var(--p-accent)", color: "white", border: "1px solid transparent" }
                  : {
                      background: "var(--p-surface)",
                      color: "var(--p-muted)",
                      border: "1px solid var(--p-border)",
                    }
              }
            >
              {isLoading && <SpinnerGap size={12} weight="bold" className="animate-spin" />}
              {isDone && !isLoading && !isSent && !isSendFailed && (
                <CheckCircle
                  size={12}
                  weight="fill"
                  style={{ color: isActive ? "white" : "var(--p-accent)" }}
                />
              )}
              {hasError && !isLoading && (
                <WarningCircle
                  size={12}
                  weight="duotone"
                  style={{ color: isActive ? "white" : "var(--p-rose)" }}
                />
              )}
              {isSent && !isLoading && (
                <PaperPlaneTilt
                  size={12}
                  weight="fill"
                  style={{ color: isActive ? "white" : "var(--p-accent)" }}
                />
              )}
              {isSendFailed && !isLoading && (
                <WarningCircle
                  size={12}
                  weight="duotone"
                  style={{ color: isActive ? "white" : "var(--p-rose)" }}
                />
              )}
              {p.name}
            </button>
          )
        })}
      </div>

      {/* Active supplier's RFQ */}
      {activeIndex !== null && (
        <SupplierQuoteCard
          key={activeIndex}
          error={quotationsErrorMap[activeIndex] ?? null}
          loading={quotationsLoadingSet.includes(activeIndex)}
          provider={providers[activeIndex]}
          quote={quotationsMap[activeIndex] ?? null}
          rfqSendState={rfqSendStates[activeIndex]}
        />
      )}
    </section>
  )
}

// ── Audit trail ────────────────────────────────────────────────────────────────

type AuditEvent = {
  id: string
  timestamp: string
  label: string
  detail?: string
}

// ── Procora send state (per supplier index) ────────────────────────────────────

type RfqSendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; campaignId?: string }
  | { status: "failed"; error: string }

function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <aside
      className="w-52 flex-shrink-0 sticky top-24 self-start"
      aria-label="Audit trail"
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-3"
        style={{ color: "var(--p-muted)" }}
      >
        Audit trail
      </p>
      <div className="relative">
        {events.length > 0 && (
          <div
            className="absolute left-[5px] top-2 bottom-2 w-px"
            style={{ background: "var(--p-border)" }}
          />
        )}
        <div className="grid gap-3">
          {events.length === 0 ? (
            <p className="text-[11px] pl-1" style={{ color: "var(--p-faint)" }}>
              No events yet
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex gap-2.5 items-start">
                <span
                  className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-[2px] border-2"
                  style={{
                    background: "var(--p-accent)",
                    borderColor: "var(--p-surface-alt)",
                    zIndex: 1,
                    position: "relative",
                  }}
                />
                <div className="min-w-0 max-w-full">
                  <p
                    className="text-[12px] font-medium leading-[1.3] break-words"
                    style={{ color: "var(--p-ink)" }}
                  >
                    {event.label}
                  </p>
                  {event.detail && (
                    <p
                      className="text-[11px] leading-[1.3] mt-[2px] whitespace-normal break-words [overflow-wrap:anywhere]"
                      style={{ color: "var(--p-ink-2)" }}
                    >
                      {event.detail}
                    </p>
                  )}
                  <p
                    className="font-mono text-[10px] mt-[3px]"
                    style={{ color: "var(--p-muted)" }}
                  >
                    {event.timestamp}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

// ── Root export ────────────────────────────────────────────────────────────────

export function SearchResults({
  chatId,
  query,
  mode = "chat",
  initialMessages,
}: {
  chatId: string
  query: string
  mode?: "chat" | "procurement"
  initialMessages: UIMessage[]
}) {
  const isProcurementMode = mode === "procurement"
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/search",
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, messages },
        }),
      }),
    []
  )

  const { messages, sendMessage, status, error } = useChat({
    id: chatId,
    transport,
    messages: initialMessages,
  })

  // ── Procurement search state ──
  const [searchRevision, setSearchRevision] = useState(0)
  const [procurementPayload, setProcurementPayload] = useState<ProcurementSearchPayload | null>(null)
  const [procurementResponse, setProcurementResponse] = useState<ProcurementSearchResponse | null>(null)
  const [procurementLoading, setProcurementLoading] = useState(false)
  const [procurementError, setProcurementError] = useState<string | null>(null)
  const [procurementStep, setProcurementStep] = useState<ProcurementWorkflowStep>(0)

  // ── Multi-select supplier state (step 1) ──
  const [selectedCompanyIndices, setSelectedCompanyIndices] = useState<number[]>([])

  // ── Review & approve state (step 2) ──
  const [approvedIndices, setApprovedIndices] = useState<number[]>([])
  const [reviewExpandedIndex, setReviewExpandedIndex] = useState<number | null>(null)
  const [companyDetailsMap, setCompanyDetailsMap] = useState<
    Record<number, ProcurementCompanyDetailsResponse>
  >({})
  const [companyDetailsLoadingSet, setCompanyDetailsLoadingSet] = useState<number[]>([])
  const [companyDetailsErrorMap, setCompanyDetailsErrorMap] = useState<Record<number, string>>({})

  // ── RFQ generation state (step 3) ──
  const [quotationsMap, setQuotationsMap] = useState<Record<number, ProcurementQuoteResponse>>({})
  const [quotationsLoadingSet, setQuotationsLoadingSet] = useState<number[]>([])
  const [quotationsErrorMap, setQuotationsErrorMap] = useState<Record<number, string>>({})
  // Ref tracks which quotations have been started — prevents strict-mode double-fire
  const quotationStartedRef = useRef<Set<number>>(new Set())

  // ── Procora send state ──
  // DB identifiers returned by /api/procurement/search when persistence succeeds.
  // Undefined means the search ran but DB writes failed (Procora send is unavailable).
  const [dbMeta, setDbMeta] = useState<ProcurementSearchResponse["_db"] | undefined>(undefined)
  // Per-supplier (by provider index) RFQ send state for the current campaign send.
  const [rfqSendStates, setRfqSendStates] = useState<Record<number, RfqSendState>>({})
  const [campaignSending, setCampaignSending] = useState(false)
  // Manually entered emails for suppliers where no email was auto-detected
  const [manualEmails, setManualEmails] = useState<Record<number, string>>({})
  const [receivedQuotations, setReceivedQuotations] = useState<ProcurementReceivedQuotation[]>([])
  const [receivedQuotationsLoading, setReceivedQuotationsLoading] = useState(false)
  const [receivedQuotationsError, setReceivedQuotationsError] = useState<string | null>(null)

  // ── Audit trail ──
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  // ── Chat store sync ──
  const hydrateChat = useChatStore((s) => s.hydrate)
  const setConversation = useChatStore((s) => s.setConversation)
  const setVisibleMessages = useChatStore((s) => s.setVisibleMessages)
  const setStoreStatus = useChatStore((s) => s.setStatus)

  // ── Procurement header store sync ──
  const setProcStep = useProcurementStore((s) => s.setStep)
  const setProcStatus = useProcurementStore((s) => s.setStatus)
  const setProcSuppliersFound = useProcurementStore((s) => s.setSuppliersFound)
  const resetProcStore = useProcurementStore((s) => s.reset)

  useEffect(() => {
    if (isProcurementMode) return
    hydrateChat({
      conversation: { chatId, query },
      messages: initialMessages,
      status: "ready",
    })
  }, [chatId, query, initialMessages, hydrateChat, isProcurementMode])

  useEffect(() => {
    if (isProcurementMode) return
    setConversation({ chatId, query })
    setVisibleMessages(messages)
    setStoreStatus(status)
  }, [chatId, query, messages, status, setConversation, setStoreStatus, setVisibleMessages, isProcurementMode])

  // ── Procurement: bootstrap search from sessionStorage ─────────────────────────

  useEffect(() => {
    if (!isProcurementMode || !mounted || !chatId) return

    // Reset all state
    setProcurementPayload(null)
    setProcurementResponse(null)
    setProcurementError(null)
    setProcurementStep(0)
    setSelectedCompanyIndices([])
    setApprovedIndices([])
    setReviewExpandedIndex(null)
    setCompanyDetailsMap({})
    setCompanyDetailsLoadingSet([])
    setCompanyDetailsErrorMap({})
    setQuotationsMap({})
    setQuotationsLoadingSet([])
    setQuotationsErrorMap({})
    quotationStartedRef.current.clear()
    setDbMeta(undefined)
    setRfqSendStates({})
    setCampaignSending(false)
    setManualEmails({})
    setReceivedQuotations([])
    setReceivedQuotationsLoading(false)
    setReceivedQuotationsError(null)

    let parsedPayload: ProcurementSearchPayload

    try {
      const stored = window.sessionStorage.getItem(procurementSearchStorageKey(chatId))
      if (!stored) {
        throw new Error(
          "Structured procurement request was not found. Edit the original prompt and submit it again."
        )
      }
      parsedPayload = JSON.parse(stored) as ProcurementSearchPayload
      setProcurementPayload(parsedPayload)
    } catch (error) {
      setProcurementError(
        error instanceof Error ? error.message : "Structured procurement request was not found."
      )
      return
    }

    const controller = new AbortController()
    setProcurementLoading(true)

    fetch("/api/procurement/search", {
      body: JSON.stringify(parsedPayload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error ?? "Supplier search failed")
        const searchResponse = data as ProcurementSearchResponse
        setProcurementResponse(searchResponse)
        // Persist DB identifiers — present only when server-side persistence succeeded.
        // If absent, Procora send will be unavailable for this run (user can still mailto).
        if (searchResponse._db) setDbMeta(searchResponse._db)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setProcurementError(error instanceof Error ? error.message : "Supplier search failed")
      })
      .finally(() => {
        if (!controller.signal.aborted) setProcurementLoading(false)
      })

    return () => controller.abort()
  }, [chatId, isProcurementMode, mounted, searchRevision])

  // ── Refine search ─────────────────────────────────────────────────────────────

  const refineSearch = (extraValues: Partial<Record<ProcurementFieldKey, string>>) => {
    const stored = window.sessionStorage.getItem(procurementSearchStorageKey(chatId))
    if (!stored) return

    try {
      const payload = JSON.parse(stored) as ProcurementSearchPayload
      const updatedFields = { ...payload.fields }

      for (const [field, raw] of Object.entries(extraValues) as [ProcurementFieldKey, string][]) {
        if (!raw?.trim()) continue
        const base = { confidence: 0.92, required: false, spanText: null }
        if (field === "specifications" || field === "constraints") {
          updatedFields[field] = { ...base, value: raw.split(",").map((s) => s.trim()).filter(Boolean) }
        } else if (field === "quantity") {
          const n = parseInt(raw.replace(/[^0-9]/g, ""), 10)
          if (!isNaN(n)) updatedFields[field] = { ...base, value: n }
        } else {
          (updatedFields as Record<string, unknown>)[field] = { ...base, value: raw.trim() }
        }
      }

      const updatedMissing = (payload.missingFields ?? []).filter(
        (f) => !Object.keys(extraValues).includes(f) || !extraValues[f]?.trim()
      )

      window.sessionStorage.setItem(
        procurementSearchStorageKey(chatId),
        JSON.stringify({ ...payload, fields: updatedFields, missingFields: updatedMissing, readyToSubmit: true })
      )
      setSearchRevision((r) => r + 1)
    } catch {
      // ignore parse errors
    }
  }

  // ── Audit logging ─────────────────────────────────────────────────────────────

  const logAudit = useCallback((label: string, detail?: string) => {
    setAuditEvents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        label,
        detail,
      },
    ])
  }, [])

  useEffect(() => {
    if (!isProcurementMode || !procurementLoading) return
    logAudit("Search started", query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procurementLoading])

  useEffect(() => {
    if (!isProcurementMode || !procurementResponse) return
    const count = procurementResponse.results?.length ?? 0
    logAudit("Suppliers found", `${count} matching supplier${count !== 1 ? "s" : ""}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procurementResponse])

  // ── Procurement store sync (header) ───────────────────────────────────────────

  useEffect(() => {
    if (!isProcurementMode) return
    resetProcStore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, isProcurementMode])

  useEffect(() => {
    if (!isProcurementMode) return
    setProcStep(procurementStep, procurementWorkflowSteps[procurementStep])
  }, [isProcurementMode, procurementStep, setProcStep])

  useEffect(() => {
    if (!isProcurementMode) return
    if (procurementLoading) { setProcStatus("searching"); return }
    if (companyDetailsLoadingSet.length > 0) { setProcStatus("analyzing"); return }
    if (quotationsLoadingSet.length > 0) { setProcStatus("generating"); return }
    const doneQuotes = Object.keys(quotationsMap).length
    if (doneQuotes > 0 && doneQuotes === approvedIndices.length) { setProcStatus("complete"); return }
    if (procurementStep === 2 && approvedIndices.length > 0) { setProcStatus("analyzing"); return }
    if (selectedCompanyIndices.length === 0 && procurementResponse) { setProcStatus("awaiting-selection"); return }
    if (procurementResponse) { setProcStatus("idle"); return }
    setProcStatus("idle")
  }, [
    isProcurementMode,
    procurementLoading,
    companyDetailsLoadingSet.length,
    quotationsLoadingSet.length,
    quotationsMap,
    approvedIndices.length,
    procurementStep,
    selectedCompanyIndices.length,
    procurementResponse,
    setProcStatus,
  ])

  useEffect(() => {
    if (!isProcurementMode) return
    if (procurementResponse) {
      setProcSuppliersFound(procurementResponse.results?.length ?? 0)
    } else {
      setProcSuppliersFound(null)
    }
  }, [isProcurementMode, procurementResponse, setProcSuppliersFound])

  // ── Company details: on-demand fetch (triggered by card expand) ───────────────

  const fetchCompanyDetails = useCallback(
    (index: number) => {
      if (companyDetailsMap[index] || companyDetailsLoadingSet.includes(index)) return
      const company = procurementResponse?.results[index]
      if (!company || !procurementPayload || !procurementResponse) return

      setCompanyDetailsLoadingSet((prev) => [...prev, index])
      setCompanyDetailsErrorMap((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })

      fetch("/api/procurement/company-details", {
        body: JSON.stringify({
          company,
          normalizedRequest: procurementResponse.normalizedRequest,
          rawText: procurementPayload.rawText,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.error ?? "Company details lookup failed")
          setCompanyDetailsMap((prev) => ({
            ...prev,
            [index]: data as ProcurementCompanyDetailsResponse,
          }))
          logAudit("Details fetched", (data as ProcurementCompanyDetailsResponse).company.name)
        })
        .catch((err) => {
          setCompanyDetailsErrorMap((prev) => ({
            ...prev,
            [index]: err instanceof Error ? err.message : "Company details lookup failed",
          }))
        })
        .finally(() => {
          setCompanyDetailsLoadingSet((prev) => prev.filter((i) => i !== index))
        })
    },
    [companyDetailsMap, companyDetailsLoadingSet, procurementPayload, procurementResponse, logAudit]
  )

  const handleExpandCard = useCallback(
    (index: number) => {
      setReviewExpandedIndex((prev) => {
        const next = prev === index ? null : index
        if (next !== null) fetchCompanyDetails(next)
        return next
      })
    },
    [fetchCompanyDetails]
  )

  useEffect(() => {
    if (!isProcurementMode || procurementStep !== 2) return
    for (const index of selectedCompanyIndices) fetchCompanyDetails(index)
  }, [fetchCompanyDetails, isProcurementMode, procurementStep, selectedCompanyIndices])

  // ── Quote generation: triggered when entering step 3 ─────────────────────────

  // Use a stable string key for the dep array to avoid re-running for same set
  const approvedIndicesKey = useMemo(
    () => [...approvedIndices].sort((a, b) => a - b).join(","),
    [approvedIndices]
  )

  useEffect(() => {
    if (!isProcurementMode || procurementStep !== 3) return
    if (!procurementPayload || !procurementResponse) return

    for (const index of approvedIndices) {
      const details = companyDetailsMap[index] ?? null
      const detailsLoading = companyDetailsLoadingSet.includes(index)
      const detailsError = companyDetailsErrorMap[index]

      if (!details && !detailsLoading && !detailsError) {
        fetchCompanyDetails(index)
        continue
      }

      if (quotationStartedRef.current.has(index)) continue
      quotationStartedRef.current.add(index)

      const company = procurementResponse.results[index]
      if (!company) continue

      setQuotationsLoadingSet((prev) => [...prev, index])
      setQuotationsErrorMap((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })

      fetch("/api/procurement/generate-quote", {
        body: JSON.stringify({
          companyDetails: details,
          normalizedRequest: procurementResponse.normalizedRequest,
          rawText: procurementPayload.rawText,
          selectedCompany: company,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null)
          if (!res.ok) {
            // Surface per-field Zod validation issues when available so regressions
            // are immediately diagnosable rather than showing a generic message.
            const issues = (data?.issues as Array<{ path: string; message: string }> | undefined)
            const detail = issues?.length
              ? issues.map((i) => `${i.path || "request"}: ${i.message}`).join(" · ")
              : null
            throw new Error(detail ?? data?.error ?? "Quotation generation failed")
          }
          setQuotationsMap((prev) => ({ ...prev, [index]: data as ProcurementQuoteResponse }))
          logAudit("RFQ generated", (data as ProcurementQuoteResponse).quotation.providerCompany)
        })
        .catch((err) => {
          setQuotationsErrorMap((prev) => ({
            ...prev,
            [index]: err instanceof Error ? err.message : "Quotation generation failed",
          }))
        })
        .finally(() => {
          setQuotationsLoadingSet((prev) => prev.filter((i) => i !== index))
        })
    }
  }, [
    approvedIndicesKey,
    companyDetailsErrorMap,
    companyDetailsLoadingSet,
    companyDetailsMap,
    fetchCompanyDetails,
    isProcurementMode,
    procurementPayload,
    procurementResponse,
    procurementStep,
  ])

  // ── Chat: auto-send on fresh chat ─────────────────────────────────────────────

  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    if (isProcurementMode) return
    if (!query || !chatId) return
    if (initialMessages.length > 0) return
    if (sentRef.current === chatId) return
    sentRef.current = chatId
    sendMessage({ text: query })
  }, [chatId, query, initialMessages.length, sendMessage, isProcurementMode])

  // ── Derived values ─────────────────────────────────────────────────────────────

  const { providers, markdown } = useMemo(() => extractFromAssistant(messages), [messages])
  const completeProviders = useMemo(
    () =>
      providers.filter(
        (p) => !!(p.name && p.url && typeof p.score === "number" && p.reasoning)
      ) as Provider[],
    [providers]
  )
  const procurementSourceProviders = useMemo(
    () => (procurementResponse ? procurementProviders(procurementResponse) : []),
    [procurementResponse]
  )
  const procurementSourceReasoning = useMemo(
    () => (procurementResponse ? procurementReasoning(procurementResponse) : ""),
    [procurementResponse]
  )
  const sourcePanelProviders = isProcurementMode ? procurementSourceProviders : completeProviders

  // ── Phase timeline ─────────────────────────────────────────────────────────────

  const mountTimeRef = useRef(
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  )

  const timelinePhases = useMemo((): TimelinePhase[] => {
    const t = (label: string) =>
      auditEvents.find((e) => e.label === label)?.timestamp ?? ""

    const supplierCount = procurementResponse?.results?.length ?? 0
    const doneQuoteCount = Object.keys(quotationsMap).length

    return [
      {
        id: "request",
        n: "01",
        title: "Request submitted",
        status: "done",
        when: mountTimeRef.current,
        actor: "You",
        summary: query.length > 120 ? query.slice(0, 120) + "…" : query,
      },
      {
        id: "sourcing",
        n: "02",
        title: "Supplier search",
        status: procurementResponse ? "done" : procurementLoading ? "active" : "queued",
        when: procurementResponse ? t("Suppliers found") : procurementLoading ? "Running…" : "",
        actor: "Procora · AI",
        summary: procurementResponse
          ? `${supplierCount} supplier${supplierCount !== 1 ? "s" : ""} matched your request.`
          : procurementLoading
          ? "Searching supplier database…"
          : "Will search suppliers matching your requirements.",
      },
      {
        id: "selection",
        n: "03",
        title: "Suppliers selected",
        status:
          approvedIndices.length > 0
            ? "done"
            : selectedCompanyIndices.length > 0
            ? "active"
            : procurementResponse
            ? "active"
            : "queued",
        when:
          approvedIndices.length > 0
            ? t("Suppliers selected")
            : selectedCompanyIndices.length > 0
            ? "Selecting…"
            : "",
        actor: "You",
        summary:
          selectedCompanyIndices.length > 0
            ? `${selectedCompanyIndices.length} supplier${
                selectedCompanyIndices.length !== 1 ? "s" : ""
              } selected for review.`
            : "Choose suppliers from the list.",
      },
      {
        id: "review",
        n: "04",
        title: "Supplier review",
        status:
          procurementStep >= 3
            ? "done"
            : procurementStep === 2
            ? "active"
            : "queued",
        when:
          procurementStep >= 3
            ? t("Approved for RFQ")
            : procurementStep === 2
            ? "Reviewing…"
            : "",
        actor: "You · Procora",
        summary:
          approvedIndices.length > 0
            ? `${approvedIndices.length} supplier${
                approvedIndices.length !== 1 ? "s" : ""
              } approved for RFQ.`
            : "Validate and approve suppliers before sending RFQs.",
      },
      {
        id: "rfq",
        n: "05",
        title: "RFQs generated",
        status:
          doneQuoteCount > 0 && doneQuoteCount === approvedIndices.length
            ? "done"
            : quotationsLoadingSet.length > 0
            ? "active"
            : "queued",
        when:
          doneQuoteCount > 0
            ? t("RFQ generated")
            : quotationsLoadingSet.length > 0
            ? "Generating…"
            : "",
        actor: "Procora · RFQ",
        summary:
          doneQuoteCount > 0
            ? `${doneQuoteCount} RFQ${doneQuoteCount !== 1 ? "s" : ""} ready to send.`
            : quotationsLoadingSet.length > 0
            ? "Generating request-for-quotation documents…"
            : "Auto-generates RFQ documents and supplier emails.",
      },
    ]
  }, [
    auditEvents,
    procurementResponse,
    procurementLoading,
    selectedCompanyIndices,
    approvedIndices,
    procurementStep,
    quotationsMap,
    quotationsLoadingSet,
    query,
  ])

  // ── Sources panel positioning ──────────────────────────────────────────────────

  const [panelOpen, setPanelOpen] = useState(false)
  const [panelVisible, setPanelVisible] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null)
  const SHIFT = 170

  useEffect(() => {
    if (isProcurementMode) return
    if (!panelOpen || !contentRef.current) return
    const update = () => {
      const el = contentRef.current
      if (!el) return
      const untransformedRight = el.offsetLeft + el.offsetWidth
      const top = el.getBoundingClientRect().top
      setPanelPos({ left: untransformedRight + 24 - SHIFT, top: Math.max(96, top) })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update)
    }
  }, [isProcurementMode, panelOpen, sourcePanelProviders.length])

  useEffect(() => {
    if (!isProcurementMode || procurementStep === 0 || !panelVisible) return
    setPanelOpen(false)
    setPanelVisible(false)
  }, [isProcurementMode, panelVisible, procurementStep])

  // ── Supplier actions — must be above any early return ─────────────────────────

  const toggleSupplierSelection = useCallback((_provider: Provider, index: number) => {
    setSelectedCompanyIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }, [])

  const toggleApproval = useCallback((index: number) => {
    setApprovedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }, [])

  // ── Procora campaign send — must be above any early return ────────────────────

  const handleSendCampaign = useCallback(async () => {
    if (!dbMeta || campaignSending) return

    // Collect approved suppliers that have a sendable email + a DB id.
    // Falls back to manualEmails[idx] when no email was auto-detected on the quote.
    const sendEntries = approvedIndices
      .map((idx) => {
        const quote = quotationsMap[idx]
        const supplierId = dbMeta.suppliers[idx]?.id
        if (!supplierId) return null
        // Prefer auto-detected email; fall back to manually-entered one
        const detectedEmail = quote?.email?.canSend ? (quote.email.recipient ?? null) : null
        const manualEmail = manualEmails[idx]?.trim() ?? ""
        const effectiveEmail = detectedEmail ?? (isValidEmail(manualEmail) ? manualEmail : null)
        if (!effectiveEmail || !quote) return null
        return {
          idx,
          supplierId,
          supplierEmail: effectiveEmail,
          subject: quote.email.subject,
          body: quote.email.body,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    if (sendEntries.length === 0) return

    setCampaignSending(true)

    // Mark all sendable suppliers as "sending"
    setRfqSendStates((prev) => {
      const next = { ...prev }
      for (const { idx } of sendEntries) next[idx] = { status: "sending" }
      return next
    })

    try {
      const res = await fetch("/api/procurement/send-rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: dbMeta.requestId,
          messages: sendEntries.map(({ supplierId, supplierEmail, subject, body }) => ({
            supplierId,
            supplierEmail,
            subject,
            body,
          })),
        }),
      })

      const data = (await res.json().catch(() => null)) as {
        campaignId?: string
        results?: Array<{ supplierId: string; status: "QUEUED" | "FAILED"; error?: string }>
        error?: string
      } | null

      if (!res.ok) throw new Error(data?.error ?? "Failed to send RFQ campaign")

      const results = data?.results ?? []
      const campaignId = data?.campaignId

      setRfqSendStates((prev) => {
        const next = { ...prev }
        for (const entry of sendEntries) {
          const result = results.find((r) => r.supplierId === entry.supplierId)
          if (result?.status === "QUEUED") {
            next[entry.idx] = { status: "sent", campaignId }
          } else {
            next[entry.idx] = { status: "failed", error: result?.error ?? "Unknown error" }
          }
        }
        return next
      })

      const sentCount = results.filter((r) => r.status === "QUEUED").length
      logAudit(
        "Campaign sent via Procora",
        `${sentCount} of ${sendEntries.length} RFQ${sendEntries.length !== 1 ? "s" : ""} queued`,
      )
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Send failed"
      setRfqSendStates((prev) => {
        const next = { ...prev }
        for (const { idx } of sendEntries) next[idx] = { status: "failed", error: errorMsg }
        return next
      })
      logAudit("Campaign send failed", errorMsg)
    } finally {
      setCampaignSending(false)
    }
  }, [dbMeta, campaignSending, approvedIndices, quotationsMap, manualEmails, logAudit])

  const refreshReceivedQuotations = useCallback(async () => {
    if (!dbMeta?.requestId) return

    setReceivedQuotationsLoading(true)
    setReceivedQuotationsError(null)

    try {
      const response = await fetch(`/api/procurement/requests/${dbMeta.requestId}/quotations`, {
        method: "GET",
      })
      const data = (await response.json().catch(() => null)) as
        | { error?: string; quotations?: ProcurementReceivedQuotation[] }
        | null

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to load quotations")
      }

      setReceivedQuotations(data?.quotations ?? [])
    } catch (error) {
      setReceivedQuotationsError(
        error instanceof Error ? error.message : "Failed to load quotations"
      )
    } finally {
      setReceivedQuotationsLoading(false)
    }
  }, [dbMeta?.requestId])

  useEffect(() => {
    if (!isProcurementMode || procurementStep !== 3 || !dbMeta?.requestId) return

    void refreshReceivedQuotations()
    const intervalId = window.setInterval(() => {
      void refreshReceivedQuotations()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [dbMeta?.requestId, isProcurementMode, procurementStep, refreshReceivedQuotations])

  if (!query) return null

  const heading = null

  const isStreaming = status === "streaming" || status === "submitted"
  const nothingYet = providers.length === 0 && !markdown
  const requestStarted = initialMessages.length > 0 || messages.length > 0 || isStreaming
  const searchComplete = requestStarted && status === "ready"

  const showSourcesPanel = () => {
    const nextOpen = !panelVisible
    setPanelOpen(nextOpen)
    setPanelVisible(nextOpen)
  }

  // ── Navigation logic ───────────────────────────────────────────────────────────

  const procurementNextDisabled =
    (procurementStep === 0 &&
      (!procurementResponse || procurementLoading || Boolean(procurementError))) ||
    (procurementStep === 1 && selectedCompanyIndices.length === 0) ||
    (procurementStep === 2 && approvedIndices.length === 0) ||
    procurementStep === 3

  const goToNextProcurementStep = () => {
    if (procurementNextDisabled) return
    const nextStep = Math.min(3, procurementStep + 1) as ProcurementWorkflowStep

    // Entering Review & Approve: init approved = all selected
    if (procurementStep === 1 && nextStep === 2) {
      setApprovedIndices([...selectedCompanyIndices])
      setCompanyDetailsMap({})
      setCompanyDetailsLoadingSet([])
      setCompanyDetailsErrorMap({})
      setReviewExpandedIndex(null)
      logAudit(
        "Suppliers selected",
        `${selectedCompanyIndices.length} selected for review`
      )
    }

    // Entering Send RFQs: clear ref so quotes regenerate if needed
    if (procurementStep === 2 && nextStep === 3) {
      quotationStartedRef.current.clear()
      logAudit(
        "Approved for RFQ",
        `${approvedIndices.length} supplier${approvedIndices.length !== 1 ? "s" : ""} approved`
      )
    }

    setProcurementStep(nextStep)
  }

  const goToPreviousProcurementStep = () => {
    setProcurementStep((step) => Math.max(0, step - 1) as ProcurementWorkflowStep)
  }

  const goToProcurementStep = (step: ProcurementWorkflowStep) => {
    setProcurementStep(step)
  }

  const procurementStepAccessible = [
    true,
    Boolean(procurementResponse),
    selectedCompanyIndices.length > 0,
    approvedIndices.length > 0,
  ]
  const isReviewStep = procurementStep === 2
  const procurementSourcesOpen =
    isProcurementMode && !isReviewStep && panelVisible && sourcePanelProviders.length > 0

  // ── SSR guard ──────────────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {heading}
      </div>
    )
  }

  // ── Procurement mode render ────────────────────────────────────────────────────

  if (isProcurementMode) {
    return (
      <div
        className={cn(
          "mx-auto w-full",
          procurementSourcesOpen
            ? "max-w-[1320px] transition-[max-width] duration-300 ease-out"
            : "max-w-5xl transition-[max-width] duration-300 ease-out"
        )}
      >
        <PhaseTimeline phases={timelinePhases} />
        <div
          className={cn(
            "min-w-0 max-w-full",
            "grid w-full grid-cols-[minmax(0,1fr)] gap-y-6 xl:items-start xl:transition-[grid-template-columns,gap] xl:duration-300 xl:ease-out",
            procurementSourcesOpen
              ? "xl:grid-cols-[minmax(560px,1fr)_300px_220px] xl:gap-x-6 2xl:grid-cols-[minmax(650px,1fr)_310px_230px]"
              : "xl:grid-cols-[minmax(0,1fr)_0px_220px] xl:gap-x-4"
          )}
        >
          <motion.div
            ref={contentRef}
            animate={{ x: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            onAnimationComplete={() => {
              if (panelOpen) setPanelVisible(true)
            }}
            className="flex min-w-0 max-w-full flex-1 flex-col gap-8"
          >
            <ProcurementWorkflowChrome
              currentStep={procurementStep}
              heading={heading}
              nextDisabled={procurementNextDisabled}
              onBack={goToPreviousProcurementStep}
              onNext={goToNextProcurementStep}
              onGoToStep={goToProcurementStep}
              stepAccessible={procurementStepAccessible}
            >
              {procurementStep === 0 && (
                <AnalysisStep
                  error={procurementError}
                  loading={procurementLoading}
                  onRefine={refineSearch}
                  onShowSources={showSourcesPanel}
                  payload={procurementPayload}
                  response={procurementResponse}
                  sourceProviders={procurementSourceProviders}
                  sourceReasoning={procurementSourceReasoning}
                />
              )}

              {procurementStep === 1 && (
                <CompaniesStep
                  onToggleCompany={toggleSupplierSelection}
                  providers={procurementSourceProviders}
                  selectedIndices={selectedCompanyIndices}
                />
              )}

              {procurementStep === 2 && (
                <ReviewAndApproveStep
                  approvedIndices={approvedIndices}
                  companyDetailsErrorMap={companyDetailsErrorMap}
                  companyDetailsLoadingSet={companyDetailsLoadingSet}
                  companyDetailsMap={companyDetailsMap}
                  expandedIndex={reviewExpandedIndex}
                  onContinue={goToNextProcurementStep}
                  onExpandCard={handleExpandCard}
                  onToggleApproval={toggleApproval}
                  providers={procurementSourceProviders}
                  selectedIndices={selectedCompanyIndices}
                />
              )}

              {procurementStep === 3 && (
                <MultiRFQStep
                  approvedIndices={approvedIndices}
                  campaignSending={campaignSending}
                  dbMeta={dbMeta}
                  manualEmails={manualEmails}
                  onRefreshQuotations={refreshReceivedQuotations}
                  onManualEmailChange={(idx, email) =>
                    setManualEmails((prev) => ({ ...prev, [idx]: email }))
                  }
                  onSendCampaign={handleSendCampaign}
                  providers={procurementSourceProviders}
                  receivedQuotations={receivedQuotations}
                  receivedQuotationsError={receivedQuotationsError}
                  receivedQuotationsLoading={receivedQuotationsLoading}
                  quotationsErrorMap={quotationsErrorMap}
                  quotationsLoadingSet={quotationsLoadingSet}
                  quotationsMap={quotationsMap}
                  rfqSendStates={rfqSendStates}
                />
              )}
            </ProcurementWorkflowChrome>
          </motion.div>

          <div
            className={cn(
              "min-w-0 max-w-full overflow-hidden",
              !procurementSourcesOpen && "hidden xl:block"
            )}
          >
            <SourcesPanel
              providers={procurementSourceProviders}
              variant="inline"
              visible={procurementSourcesOpen}
              onClose={() => {
                setPanelOpen(false)
                setPanelVisible(false)
              }}
            />
          </div>

          <AuditTrail events={auditEvents} />
        </div>
      </div>
    )
  }

  // ── Chat mode render ───────────────────────────────────────────────────────────

  if (nothingYet && isStreaming) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {heading}
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <SpinnerGap size={26} weight="bold" className="animate-spin text-primary" />
          <p className="text-sm">Searching for the best providers…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {heading}
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <WarningCircle size={26} weight="duotone" className="text-destructive" />
          <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <motion.div
        ref={contentRef}
        animate={{ x: panelOpen ? -SHIFT : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (panelOpen) setPanelVisible(true)
        }}
        className="max-w-3xl mx-auto flex flex-col gap-8"
      >
        {heading}

        {providers.length > 0 && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SourceChips providers={completeProviders} onShowAll={showSourcesPanel} />
          </motion.div>
        )}

        {(providers.length > 0 || markdown) && (
          <ReasoningSection markdown={markdown} isStreaming={isStreaming} />
        )}

        {searchComplete && completeProviders.length > 0 && (
          <ProviderListPanel providers={completeProviders} />
        )}
      </motion.div>

      <SourcesPanel
        providers={completeProviders}
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
        onExitComplete={() => setPanelOpen(false)}
        position={panelPos}
      />
    </>
  )
}
