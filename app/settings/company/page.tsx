"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { ProcuraTopBar } from "@/app/components/procura-topbar"
import { Buildings, Envelope, IdentificationCard, Link, PencilSimple, Trash, User, UserPlus, UsersThree } from "phosphor-react"

type ApproverItem = {
  id: string
  approverUserId: string
  thresholdAmount: string | null
  thresholdCurrency: string | null
  approverUser: { id: string; name: string; email: string }
}

type Settings = {
  companyName?: string | null
  senderName?: string | null
  senderRole?: string | null
  senderEmail?: string | null
  logoUrl?: string | null
  signature?: string | null
}

const EMPTY: Settings = {
  companyName: "",
  senderName: "",
  senderRole: "",
  senderEmail: "",
  logoUrl: "",
  signature: "",
}

export default function CompanySettingsPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [form, setForm] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Approvers state
  const [approvers, setApprovers] = useState<ApproverItem[]>([])
  const [approverEmail, setApproverEmail] = useState("")
  const [approverThreshold, setApproverThreshold] = useState("")
  const [approverCurrency, setApproverCurrency] = useState("CHF")
  const [addingApprover, setAddingApprover] = useState(false)
  const [approverError, setApproverError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && !session) router.push("/sign-in")
  }, [isPending, session, router])

  useEffect(() => {
    if (!session) return
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data: Settings) => {
        setForm({
          companyName: data.companyName ?? "",
          senderName: data.senderName ?? "",
          senderRole: data.senderRole ?? "",
          senderEmail: data.senderEmail ?? "",
          logoUrl: data.logoUrl ?? "",
          signature: data.signature ?? "",
        })
      })
      .catch(() => setError("Could not load settings."))
      .finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    if (!session) return
    fetch("/api/approvers")
      .then((r) => r.json())
      .then((data: { approvers: ApproverItem[] }) => setApprovers(data.approvers ?? []))
      .catch(() => {})
  }, [session])

  async function handleAddApprover(e: React.FormEvent) {
    e.preventDefault()
    setApproverError(null)
    setAddingApprover(true)
    try {
      const res = await fetch("/api/approvers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: approverEmail.trim(),
          thresholdAmount: approverThreshold ? Number(approverThreshold) : null,
          thresholdCurrency: approverThreshold ? approverCurrency : null,
        }),
      })
      const data = (await res.json()) as { approver?: ApproverItem; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to add approver")
      if (data.approver) setApprovers((prev) => [...prev, data.approver!])
      setApproverEmail("")
      setApproverThreshold("")
    } catch (e) {
      setApproverError(e instanceof Error ? e.message : "Failed to add approver")
    } finally {
      setAddingApprover(false)
    }
  }

  async function handleRemoveApprover(id: string) {
    const res = await fetch(`/api/approvers/${id}`, { method: "DELETE" })
    if (res.ok) {
      setApprovers((prev) => prev.filter((a) => a.id !== id))
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setApproverError(data.error ?? "Failed to remove approver")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const res = await fetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName || null,
          senderName: form.senderName || null,
          senderRole: form.senderRole || null,
          senderEmail: form.senderEmail || null,
          logoUrl: form.logoUrl || null,
          signature: form.signature || null,
        }),
      })
      if (!res.ok) throw new Error("Save failed")
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError("Could not save settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  function set(field: keyof Settings) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  if (isPending || loading) {
    return (
      <div className="min-h-svh" style={{ background: "var(--p-bg)" }}>
        <ProcuraTopBar rfqId="" />
        <div className="flex items-center justify-center py-32">
          <span className="text-sm" style={{ color: "var(--p-muted)" }}>Loading…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh" style={{ background: "var(--p-bg)" }}>
      <ProcuraTopBar rfqId="" />

      <main className="mx-auto max-w-2xl px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--p-muted)" }}>
            Account
          </p>
          <h1
            className="text-[22px] font-semibold tracking-[-0.03em]"
            style={{ color: "var(--p-ink)" }}
          >
            Sender identity
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--p-ink-2)" }}>
            This information appears on every RFQ email sent to suppliers — company name, your name, and email signature.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Company */}
          <Section icon={<Buildings size={15} weight="duotone" />} title="Company">
            <Field
              label="Company name"
              placeholder="e.g. Garage Bern AG"
              value={form.companyName ?? ""}
              onChange={set("companyName")}
            />
            <Field
              label="Logo URL"
              placeholder="https://yourcompany.com/logo.png"
              value={form.logoUrl ?? ""}
              onChange={set("logoUrl")}
              icon={<Link size={13} />}
            />
          </Section>

          {/* Sender */}
          <Section icon={<User size={15} weight="duotone" />} title="Sender">
            <Field
              label="Your name"
              placeholder="e.g. Sophie Weber"
              value={form.senderName ?? ""}
              onChange={set("senderName")}
              icon={<IdentificationCard size={13} />}
            />
            <Field
              label="Your role"
              placeholder="e.g. Procurement Manager"
              value={form.senderRole ?? ""}
              onChange={set("senderRole")}
            />
            <Field
              label="Reply-to email"
              placeholder="e.g. sophie@garagebern.ch"
              value={form.senderEmail ?? ""}
              onChange={set("senderEmail")}
              type="email"
              icon={<Envelope size={13} />}
            />
          </Section>

          {/* Signature */}
          <Section icon={<PencilSimple size={15} weight="duotone" />} title="Email signature">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium" style={{ color: "var(--p-ink-2)" }}>
                Custom signature (optional)
              </label>
              <textarea
                rows={4}
                placeholder={"e.g.\nSophie Weber — Procurement Manager\nGarage Bern AG · garage-bern.ch\n+41 31 000 00 00"}
                value={form.signature ?? ""}
                onChange={set("signature")}
                className="w-full rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2"
                style={{
                  background: "var(--p-surface)",
                  border: "1px solid var(--p-border)",
                  color: "var(--p-ink)",
                  lineHeight: 1.6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  // @ts-expect-error css custom property
                  "--tw-ring-color": "var(--p-accent)",
                }}
              />
              <p className="text-[11px]" style={{ color: "var(--p-muted)" }}>
                If left empty, emails are signed with your name and company name automatically.
              </p>
            </div>
          </Section>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--p-accent)" }}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>

            {saved && (
              <span className="text-sm font-medium" style={{ color: "var(--p-accent)" }}>
                ✓ Saved
              </span>
            )}
            {error && (
              <span className="text-sm" style={{ color: "var(--p-rose)" }}>
                {error}
              </span>
            )}
          </div>
        </form>

        {/* ── Approvers ─────────────────────────────────────────────────────── */}
        <div className="mt-8">
          <Section icon={<UsersThree size={15} weight="duotone" />} title="Approval workflow">
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--p-ink-2)" }}>
              Add approvers who must review supplier selections above a certain amount.
              Leave threshold empty to require approval on every selection.
            </p>

            {/* Existing approvers */}
            {approvers.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {approvers.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--p-surface-alt)", border: "1px solid var(--p-border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--p-ink)" }}>
                        {a.approverUser.name}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "var(--p-muted)" }}>
                        {a.approverUser.email}
                        {a.thresholdAmount
                          ? ` · above ${Number(a.thresholdAmount).toLocaleString()} ${a.thresholdCurrency ?? ""}`
                          : " · always required"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveApprover(a.id)}
                      className="flex-shrink-0 transition-opacity hover:opacity-70"
                      style={{ color: "var(--p-muted)" }}
                      aria-label="Remove approver"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add approver form */}
            <form onSubmit={handleAddApprover} className="flex flex-col gap-3 mt-1">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="email"
                  placeholder="approver@company.com"
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  required
                  className="rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--p-surface-alt)",
                    border: "1px solid var(--p-border)",
                    color: "var(--p-ink)",
                    // @ts-expect-error css custom property
                    "--tw-ring-color": "var(--p-accent)",
                  }}
                />
                <button
                  type="submit"
                  disabled={addingApprover || !approverEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: "var(--p-accent)" }}
                >
                  <UserPlus size={13} />
                  {addingApprover ? "Adding…" : "Add"}
                </button>
              </div>

              {/* Optional threshold */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Threshold amount (optional)"
                  value={approverThreshold}
                  onChange={(e) => setApproverThreshold(e.target.value)}
                  className="flex-1 rounded-lg py-2 px-3 text-[12px] focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--p-surface-alt)",
                    border: "1px solid var(--p-border)",
                    color: "var(--p-ink)",
                    // @ts-expect-error css custom property
                    "--tw-ring-color": "var(--p-accent)",
                  }}
                />
                <select
                  value={approverCurrency}
                  onChange={(e) => setApproverCurrency(e.target.value)}
                  disabled={!approverThreshold}
                  className="rounded-lg py-2 px-2 text-[12px] focus:outline-none"
                  style={{
                    background: "var(--p-surface-alt)",
                    border: "1px solid var(--p-border)",
                    color: approverThreshold ? "var(--p-ink)" : "var(--p-muted)",
                  }}
                >
                  {["CHF", "EUR", "USD", "GBP"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {approverError && (
                <p className="text-[11px]" style={{ color: "var(--p-rose)" }}>{approverError}</p>
              )}
              <p className="text-[11px]" style={{ color: "var(--p-muted)" }}>
                The approver must already have a Procora account.
              </p>
            </form>
          </Section>
        </div>
      </main>
    </div>
  )
}

function Section({
  children,
  icon,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  title: string
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--p-accent)" }}>{icon}</span>
        <span className="text-[13px] font-semibold" style={{ color: "var(--p-ink)" }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Field({
  icon,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  icon?: React.ReactNode
  label: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium" style={{ color: "var(--p-ink-2)" }}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--p-muted)" }}
          >
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2"
          style={{
            background: "var(--p-surface-alt)",
            border: "1px solid var(--p-border)",
            color: "var(--p-ink)",
            paddingLeft: icon ? "2rem" : "0.75rem",
            paddingRight: "0.75rem",
            // @ts-expect-error css custom property
            "--tw-ring-color": "var(--p-accent)",
          }}
        />
      </div>
    </div>
  )
}
