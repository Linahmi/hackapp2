"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  SpinnerGap,
  Buildings,
  WarningCircle,
  Brain,
  BookOpen,
  CheckCircle,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  LinkSimple,
  X,
  Globe,
} from "phosphor-react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Streamdown } from "streamdown"

import { ProviderListPanel, type RankedProvider } from "@/app/components/provider-list-panel"
import { useChatStore } from "@/lib/stores/chat-store"
import {
  type ProcurementCompanyDetailsResponse,
  type ProcurementQuoteResponse,
  procurementSearchStorageKey,
  type ProcurementSearchPayload,
  type ProcurementSearchResponse,
} from "@/lib/procurement-search-types"

type Provider = RankedProvider

// ── Sources panel ──────────────────────────────────────────────────────────────

function SourcesPanel({
  providers,
  visible,
  onClose,
  position,
  onExitComplete,
}: {
  providers: Provider[]
  visible: boolean
  onClose: () => void
  position?: { left: number; top: number } | null
  onExitComplete?: () => void
}) {
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
      className="w-72 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-lg z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Buildings size={14} weight="duotone" className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {providers.length} providers
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
            <div key={i} className="px-4 py-3">
              <p className="text-sm font-medium text-foreground mb-0.5">
                {i + 1}. {p.name}
              </p>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1.5"
              >
                <Globe size={10} />
                {hostname} · {i + 1}
              </a>
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                {p.reasoning}
              </p>
            </div>
          )
        })}
      </div>
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

    return {
      matchedFields: result.matchedFields.map(fieldLabel),
      name: result.supplierName || result.title,
      reasoning: `${result.snippet || result.title}${
        matched ? ` Matched: ${matched}.` : ""
      }${warnings}`,
      score: Math.round(result.estimatedFit * 100),
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
    request.specifications.length > 0
      ? `specs: ${request.specifications.join(", ")}`
      : null,
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

const procurementWorkflowSteps = [
  "Analysis",
  "Companies",
  "Company details",
  "Quotation",
] as const

type ProcurementWorkflowStep = 0 | 1 | 2 | 3
type ProcurementCompany = ProcurementSearchResponse["results"][number]

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
}: {
  children: ReactNode
  currentStep: ProcurementWorkflowStep
  heading: ReactNode
  nextDisabled: boolean
  onBack: () => void
  onNext: () => void
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
            {procurementWorkflowSteps.map((step, index) => (
              <span
                key={step}
                className={
                  index === currentStep
                    ? "font-semibold text-foreground"
                    : "hidden sm:inline"
                }
              >
                {index + 1}. {step}
              </span>
            ))}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{
                width: `${((currentStep + 1) / procurementWorkflowSteps.length) * 100}%`,
              }}
            />
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

function NormalizedRequestCard({
  response,
}: {
  response: ProcurementSearchResponse
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Buildings size={15} weight="duotone" className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Normalized procurement request
          </h2>
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

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {response.queryUsed}
      </p>
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

function AnalysisStep({
  error,
  loading,
  onShowSources,
  payload,
  response,
  sourceProviders,
  sourceReasoning,
}: {
  error: string | null
  loading: boolean
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

  return (
    <>
      {sourceProviders.length > 0 && (
        <SourceChips providers={sourceProviders} onShowAll={onShowSources} />
      )}
      <ReasoningSection markdown={sourceReasoning} isStreaming={false} />
      <NormalizedRequestCard response={response} />
      <WarningsList warnings={response.warnings} />
    </>
  )
}

function CompaniesStep({
  onSelectCompany,
  providers,
  selectedIndex,
}: {
  onSelectCompany: (provider: Provider, index: number) => void
  providers: Provider[]
  selectedIndex: number | null
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
          <h2 className="text-sm font-semibold text-foreground">Matching companies</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select one company to continue to detailed buying information.
          </p>
        </div>
        {selectedIndex !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            <CheckCircle size={13} weight="fill" />
            Selected
          </span>
        )}
      </div>

      <ProviderListPanel
        defaultExpandedFirst={false}
        onSelect={onSelectCompany}
        providers={providers}
        selectedIndex={selectedIndex}
      />
    </section>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="text-sm leading-relaxed text-foreground/85">{value}</div>
    </div>
  )
}

function CompanyDetailsStep({
  details,
  error,
  loading,
  selectedCompany,
}: {
  details: ProcurementCompanyDetailsResponse | null
  error: string | null
  loading: boolean
  selectedCompany: ProcurementCompany | null
}) {
  if (!selectedCompany) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a company before opening company details.
      </div>
    )
  }

  if (loading) return <LoadingBlock label="Checking selected company details…" />
  if (error) return <ErrorBlock message={error} />
  if (!details) return null

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Selected company
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{details.company.name}</h2>
            <a
              href={details.company.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Globe size={13} />
              {details.company.domain}
            </a>
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
            {details.company.score} match
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="Product/resource availability" value={details.productAvailability} />
        <DetailItem label="Estimated price range" value={details.priceRange} />
        <DetailItem
          label="Matching specifications"
          value={details.matchingSpecifications.join(", ")}
        />
        <DetailItem label="Delivery/location fit" value={details.deliveryFit} />
        <DetailItem label="Budget fit" value={details.budgetFit} />
        <DetailItem label="Compliance fit" value={details.complianceFit} />
      </div>

      <details className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Risks and useful links
        </summary>
        <div className="mt-4 grid gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Possible problems or risks
            </p>
            <ul className="grid gap-1 pl-4 text-sm text-muted-foreground">
              {details.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Useful links
            </p>
            <div className="flex flex-wrap gap-2">
              {details.usefulLinks.map((link) => (
                <a
                  key={`${link.type}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  <LinkSimple size={12} />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}

function downloadDocument(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function QuoteStep({
  error,
  loading,
  quote,
}: {
  error: string | null
  loading: boolean
  quote: ProcurementQuoteResponse | null
}) {
  if (loading) return <LoadingBlock label="Generating quotation and provider email…" />
  if (error) return <ErrorBlock message={error} />
  if (!quote) return null

  const mailtoUrl = quote.email.recipient
    ? `mailto:${quote.email.recipient}?subject=${encodeURIComponent(
        quote.email.subject
      )}&body=${encodeURIComponent(quote.email.body)}`
    : null

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {quote.quotation.appName}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {quote.quotation.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated {quote.quotation.generatedDate}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadDocument(
                `quotation-${quote.quotation.providerCompany
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")}.txt`,
                quote.documentText
              )
            }
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <DownloadSimple size={15} />
            Download document
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
          </div>
        </div>

        <div className="grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Recipient: </span>
            <span className="text-foreground">
              {quote.email.recipient ?? "Not found"}
            </span>
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
              No provider email address was found. Use the generated email with the
              provider contact form or copy it into your mail client.
            </p>
          )}
        </div>
      </div>
    </section>
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
        // Send only what the server needs: the chat id + the message list.
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
  const [procurementPayload, setProcurementPayload] =
    useState<ProcurementSearchPayload | null>(null)
  const [procurementResponse, setProcurementResponse] =
    useState<ProcurementSearchResponse | null>(null)
  const [procurementLoading, setProcurementLoading] = useState(false)
  const [procurementError, setProcurementError] = useState<string | null>(null)
  const [procurementStep, setProcurementStep] =
    useState<ProcurementWorkflowStep>(0)
  const [selectedCompanyIndex, setSelectedCompanyIndex] = useState<number | null>(null)
  const [companyDetails, setCompanyDetails] =
    useState<ProcurementCompanyDetailsResponse | null>(null)
  const [companyDetailsLoading, setCompanyDetailsLoading] = useState(false)
  const [companyDetailsError, setCompanyDetailsError] = useState<string | null>(null)
  const [quotation, setQuotation] = useState<ProcurementQuoteResponse | null>(null)
  const [quotationLoading, setQuotationLoading] = useState(false)
  const [quotationError, setQuotationError] = useState<string | null>(null)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const hydrateChat = useChatStore((s) => s.hydrate)
  const setConversation = useChatStore((s) => s.setConversation)
  const setVisibleMessages = useChatStore((s) => s.setVisibleMessages)
  const setStoreStatus = useChatStore((s) => s.setStatus)

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
  }, [
    chatId,
    query,
    messages,
    status,
    setConversation,
    setStoreStatus,
    setVisibleMessages,
    isProcurementMode,
  ])

  useEffect(() => {
    if (!isProcurementMode || !mounted || !chatId) return
    setProcurementPayload(null)
    setProcurementResponse(null)
    setProcurementError(null)
    setProcurementStep(0)
    setSelectedCompanyIndex(null)
    setCompanyDetails(null)
    setCompanyDetailsError(null)
    setQuotation(null)
    setQuotationError(null)

    let parsedPayload: ProcurementSearchPayload

    try {
      const stored = window.sessionStorage.getItem(
        procurementSearchStorageKey(chatId)
      )

      if (!stored) {
        throw new Error(
          "Structured procurement request was not found. Edit the original prompt and submit it again."
        )
      }

      parsedPayload = JSON.parse(stored) as ProcurementSearchPayload
      setProcurementPayload(parsedPayload)
    } catch (error) {
      setProcurementError(
        error instanceof Error
          ? error.message
          : "Structured procurement request was not found."
      )
      return
    }

    const controller = new AbortController()
    setProcurementLoading(true)

    fetch("/api/procurement/search", {
      body: JSON.stringify(parsedPayload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(data?.error ?? "Supplier search failed")
        }

        setProcurementResponse(data as ProcurementSearchResponse)
      })
      .catch((error) => {
        if (controller.signal.aborted) return

        setProcurementError(
          error instanceof Error ? error.message : "Supplier search failed"
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setProcurementLoading(false)
        }
      })

    return () => controller.abort()
  }, [chatId, isProcurementMode, mounted])

  // Auto-send the query only on a fresh chat (no persisted messages).
  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    if (isProcurementMode) return
    if (!query || !chatId) return
    if (initialMessages.length > 0) return
    if (sentRef.current === chatId) return
    sentRef.current = chatId
    sendMessage({ text: query })
  }, [chatId, query, initialMessages.length, sendMessage, isProcurementMode])

  const { providers, markdown } = useMemo(() => extractFromAssistant(messages), [messages])
  const completeProviders = useMemo(
    () =>
      providers.filter((p) => !!(p.name && p.url && typeof p.score === "number" && p.reasoning)) as Provider[],
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
  const sourcePanelProviders = isProcurementMode
    ? procurementSourceProviders
    : completeProviders
  const selectedCompany =
    selectedCompanyIndex !== null
      ? procurementResponse?.results[selectedCompanyIndex] ?? null
      : null

  useEffect(() => {
    if (!isProcurementMode || !selectedCompany || procurementStep < 2) return
    if (!procurementPayload || !procurementResponse) return
    if (companyDetails?.company.url === selectedCompany.url) return

    const controller = new AbortController()
    setCompanyDetailsLoading(true)
    setCompanyDetailsError(null)
    setCompanyDetails(null)
    setQuotation(null)
    setQuotationError(null)

    fetch("/api/procurement/company-details", {
      body: JSON.stringify({
        company: selectedCompany,
        normalizedRequest: procurementResponse.normalizedRequest,
        rawText: procurementPayload.rawText,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(data?.error ?? "Company details lookup failed")
        }

        setCompanyDetails(data as ProcurementCompanyDetailsResponse)
      })
      .catch((error) => {
        if (controller.signal.aborted) return

        setCompanyDetailsError(
          error instanceof Error ? error.message : "Company details lookup failed"
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCompanyDetailsLoading(false)
        }
      })

    return () => controller.abort()
  }, [
    companyDetails?.company.url,
    isProcurementMode,
    procurementPayload,
    procurementResponse,
    procurementStep,
    selectedCompany,
  ])

  useEffect(() => {
    if (!isProcurementMode || procurementStep < 3) return
    if (!procurementPayload || !procurementResponse || !selectedCompany || !companyDetails) {
      return
    }
    if (quotation?.quotation.providerCompany === companyDetails.company.name) return

    const controller = new AbortController()
    setQuotationLoading(true)
    setQuotationError(null)

    fetch("/api/procurement/generate-quote", {
      body: JSON.stringify({
        companyDetails,
        normalizedRequest: procurementResponse.normalizedRequest,
        rawText: procurementPayload.rawText,
        selectedCompany,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(data?.error ?? "Quotation generation failed")
        }

        setQuotation(data as ProcurementQuoteResponse)
      })
      .catch((error) => {
        if (controller.signal.aborted) return

        setQuotationError(
          error instanceof Error ? error.message : "Quotation generation failed"
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setQuotationLoading(false)
        }
      })

    return () => controller.abort()
  }, [
    companyDetails,
    isProcurementMode,
    procurementPayload,
    procurementResponse,
    procurementStep,
    quotation?.quotation.providerCompany,
    selectedCompany,
  ])

  // ── sources panel positioning ────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  // Separate "visible" flag so the panel only renders AFTER the content has
  // finished shifting left, and is hidden BEFORE the content shifts back.
  const [panelVisible, setPanelVisible] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null)
  const SHIFT = 170

  useEffect(() => {
    if (!panelOpen || !contentRef.current) {
      return
    }
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
  }, [panelOpen, sourcePanelProviders.length])

  if (!query) return null

  const heading = (
    <h1
      className="text-5xl text-foreground leading-tight"
      style={{ fontFamily: "var(--font-instrument-serif)" }}
    >
      {query}
    </h1>
  )

  const isStreaming = status === "streaming" || status === "submitted"
  const nothingYet = providers.length === 0 && !markdown
  const requestStarted = initialMessages.length > 0 || messages.length > 0 || isStreaming
  const searchComplete = requestStarted && status === "ready"
  const showSourcesPanel = () => {
    if (panelVisible) {
      // Closing: play the panel exit; unshift happens onExitComplete.
      setPanelVisible(false)
    } else {
      // Opening: shift first; panelVisible flips on animation complete.
      setPanelOpen(true)
    }
  }
  const procurementNextDisabled =
    (procurementStep === 0 && (!procurementResponse || procurementLoading || Boolean(procurementError))) ||
    (procurementStep === 1 && selectedCompanyIndex === null) ||
    (procurementStep === 2 && (!companyDetails || companyDetailsLoading || Boolean(companyDetailsError))) ||
    procurementStep === 3
  const goToNextProcurementStep = () => {
    if (procurementNextDisabled) return
    setProcurementStep((step) => Math.min(3, step + 1) as ProcurementWorkflowStep)
  }
  const goToPreviousProcurementStep = () => {
    setProcurementStep((step) => Math.max(0, step - 1) as ProcurementWorkflowStep)
  }

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {heading}
      </div>
    )
  }

  if (isProcurementMode) {
    return (
      <>
        <motion.div
          ref={contentRef}
          animate={{ x: panelOpen ? -SHIFT : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onAnimationComplete={() => {
            // Reveal the side panel only once the shift-left settles.
            if (panelOpen) setPanelVisible(true)
          }}
          className="max-w-3xl mx-auto flex flex-col gap-8"
        >
          <ProcurementWorkflowChrome
            currentStep={procurementStep}
            heading={heading}
            nextDisabled={procurementNextDisabled}
            onBack={goToPreviousProcurementStep}
            onNext={goToNextProcurementStep}
          >
            {procurementStep === 0 && (
              <AnalysisStep
                error={procurementError}
                loading={procurementLoading}
                onShowSources={showSourcesPanel}
                payload={procurementPayload}
                response={procurementResponse}
                sourceProviders={procurementSourceProviders}
                sourceReasoning={procurementSourceReasoning}
              />
            )}

            {procurementStep === 1 && (
              <CompaniesStep
                onSelectCompany={(_, index) => {
                  if (selectedCompanyIndex !== index) {
                    setCompanyDetails(null)
                    setCompanyDetailsError(null)
                    setQuotation(null)
                    setQuotationError(null)
                  }
                  setSelectedCompanyIndex(index)
                }}
                providers={procurementSourceProviders}
                selectedIndex={selectedCompanyIndex}
              />
            )}

            {procurementStep === 2 && (
              <CompanyDetailsStep
                details={companyDetails}
                error={companyDetailsError}
                loading={companyDetailsLoading}
                selectedCompany={selectedCompany}
              />
            )}

            {procurementStep === 3 && (
              <QuoteStep
                error={quotationError}
                loading={quotationLoading}
                quote={quotation}
              />
            )}
          </ProcurementWorkflowChrome>
        </motion.div>

        <SourcesPanel
          providers={procurementSourceProviders}
          visible={panelVisible}
          onClose={() => {
            // Trigger the panel's exit animation; the unshift fires onExitComplete.
            setPanelVisible(false)
          }}
          onExitComplete={() => {
            // Once the panel has fully eased out, slide the content back.
            setPanelOpen(false)
          }}
          position={panelPos}
        />
      </>
    )
  }

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
          // Reveal the side panel only once the shift-left settles.
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
            <SourceChips
              providers={completeProviders}
              onShowAll={showSourcesPanel}
            />
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
        onClose={() => {
          // Trigger the panel's exit animation; the unshift fires onExitComplete.
          setPanelVisible(false)
        }}
        onExitComplete={() => {
          // Once the panel has fully eased out, slide the content back.
          setPanelOpen(false)
        }}
        position={panelPos}
      />
    </>
  )
}
