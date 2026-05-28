import { QuotationResponseForm } from "./quotation-response-form";
import { getSupplierResponsePageData } from "@/lib/procurement-quotations";

export const dynamic = "force-dynamic";

function InvalidTokenState({
  reason,
}: {
  reason: "expired" | "invalid" | "used";
}) {
  const message =
    reason === "used"
      ? "This supplier response link has already been used."
      : reason === "expired"
        ? "This supplier response link has expired."
        : "This supplier response link is invalid.";

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,_#e8f5ec,_#f8fafc_55%)] px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
          Procora Supplier Response
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">Link unavailable</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">{message}</p>
      </div>
    </main>
  );
}

export default async function SupplierResponsePage(
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  const result = await getSupplierResponsePageData(token);

  if (!result.valid) {
    return <InvalidTokenState reason={result.reason} />;
  }

  const request = result.request;
  const summary = result.requestSummary;
  const supplierName = result.context.rfqMessage.supplier.name;
  const buyerName =
    request.user?.name || request.user?.email || "Buyer details unavailable";

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top,_#e8f5ec,_#f8fafc_55%)] px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-800">
            Request For Quotation
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-950">{request.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{request.rawPrompt}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Buyer</p>
              <p className="mt-2 text-sm text-slate-800">{buyerName}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Supplier</p>
              <p className="mt-2 text-sm text-slate-800">{supplierName}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Requested item</p>
              <p className="mt-2 text-sm text-slate-800">{summary.resourceType ?? "Not specified"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Quantity</p>
              <p className="mt-2 text-sm text-slate-800">
                {summary.quantity?.toLocaleString() ?? "Not specified"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Delivery date</p>
              <p className="mt-2 text-sm text-slate-800">{summary.deliveryDate ?? "Not specified"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Delivery location</p>
              <p className="mt-2 text-sm text-slate-800">{summary.location ?? "Not specified"}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Specifications</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                {summary.specifications.length > 0 ? (
                  summary.specifications.map((item) => <li key={item}>• {item}</li>)
                ) : (
                  <li>No specific requirements provided.</li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Constraints</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                {summary.constraints.length > 0 ? (
                  summary.constraints.map((item) => <li key={item}>• {item}</li>)
                ) : (
                  <li>No additional constraints provided.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 self-start">
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-950">Submit your quotation</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Share your commercial offer below. This public form does not require login and can be used only once for this RFQ.
            </p>
          </div>

          <QuotationResponseForm supplierName={supplierName} token={token} />
        </section>
      </div>
    </main>
  );
}
