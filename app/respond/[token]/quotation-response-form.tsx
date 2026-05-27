"use client";

import { useState } from "react";

type Props = {
  supplierName: string;
  token: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { message: string; status: "error" };

export function QuotationResponseForm({ supplierName, token }: Props) {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [formData, setFormData] = useState({
    attachmentUrl: "",
    confirmationAccepted: false,
    currency: "CHF",
    leadTimeDays: "",
    moq: "",
    notes: "",
    submittedBy: "",
    submittedRole: "",
    totalPrice: "",
    unitPrice: "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: "submitting" });

    const payload = {
      ...formData,
      confirmationAccepted: formData.confirmationAccepted,
      leadTimeDays: formData.leadTimeDays ? Number(formData.leadTimeDays) : null,
      moq: formData.moq ? Number(formData.moq) : null,
      token,
      totalPrice: formData.totalPrice,
      unitPrice: formData.unitPrice,
    };

    try {
      const response = await fetch("/api/quotations/submit", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; issues?: Array<{ message: string; path: string }> }
        | null;

      if (!response.ok) {
        const issueText = data?.issues?.map((issue) => issue.message).join(" ");
        throw new Error(issueText || data?.error || "Failed to submit quotation");
      }

      setSubmitState({ status: "success" });
    } catch (error) {
      setSubmitState({
        message: error instanceof Error ? error.message : "Failed to submit quotation",
        status: "error",
      });
    }
  }

  if (submitState.status === "success") {
    return (
      <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-8">
        <h2 className="text-xl font-semibold text-emerald-950">Quotation submitted</h2>
        <p className="mt-3 text-sm leading-6 text-emerald-900/80">
          Thank you, {supplierName}. Your quotation has been recorded and shared with the buyer.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="grid gap-2 md:grid-cols-3 md:items-end">
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Unit price</span>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={formData.unitPrice}
            onChange={(event) => setFormData((prev) => ({ ...prev, unitPrice: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Total price</span>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={formData.totalPrice}
            onChange={(event) => setFormData((prev) => ({ ...prev, totalPrice: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Currency</span>
          <input
            required
            value={formData.currency}
            onChange={(event) => setFormData((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
            className="h-11 rounded-xl border border-slate-300 px-3 uppercase outline-none transition focus:border-emerald-700"
          />
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Lead time in days</span>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.leadTimeDays}
            onChange={(event) => setFormData((prev) => ({ ...prev, leadTimeDays: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">MOQ</span>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.moq}
            onChange={(event) => setFormData((prev) => ({ ...prev, moq: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm text-slate-700">
        <span className="font-medium">Comments or notes</span>
        <textarea
          rows={5}
          value={formData.notes}
          onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
          className="rounded-2xl border border-slate-300 px-3 py-3 outline-none transition focus:border-emerald-700"
        />
      </label>

      <label className="grid gap-2 text-sm text-slate-700">
        <span className="font-medium">Attachment URL</span>
        <input
          type="url"
          placeholder="Optional. Paste a secure link to your quotation PDF or document."
          value={formData.attachmentUrl}
          onChange={(event) => setFormData((prev) => ({ ...prev, attachmentUrl: event.target.value }))}
          className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
        />
      </label>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Submitted by full name</span>
          <input
            required
            value={formData.submittedBy}
            onChange={(event) => setFormData((prev) => ({ ...prev, submittedBy: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-700">
          <span className="font-medium">Role or title</span>
          <input
            value={formData.submittedRole}
            onChange={(event) => setFormData((prev) => ({ ...prev, submittedRole: event.target.value }))}
            className="h-11 rounded-xl border border-slate-300 px-3 outline-none transition focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <input
          required
          type="checkbox"
          checked={formData.confirmationAccepted}
          onChange={(event) =>
            setFormData((prev) => ({
              ...prev,
              confirmationAccepted: event.target.checked,
            }))
          }
          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700"
        />
        <span>
          I confirm that this quotation is accurate and constitutes a valid commercial offer for 30 days.
        </span>
      </label>

      {submitState.status === "error" && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitState.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitState.status === "submitting"}
        className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-800 px-6 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitState.status === "submitting" ? "Submitting quotation..." : "Submit quotation"}
      </button>
    </form>
  );
}
