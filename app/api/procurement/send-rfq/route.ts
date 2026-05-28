import { z } from "zod";

import { auth } from "@/lib/auth";
import { getCompanySettings } from "@/db/queries";
import { sendProcurementRfqCampaign } from "@/lib/procurement-rfq-campaign";

const messageSchema = z
  .object({
    supplierId: z.string().uuid("supplierId must be a valid UUID"),
    supplierEmail: z.string().email("supplierEmail must be a valid email"),
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(20000),
  })
  .strict();

const requestSchema = z
  .object({
    buyerCompanyName: z.string().trim().max(200).nullable().optional(),
    requestId: z.string().uuid("requestId must be a valid UUID"),
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required")
      .max(20, "Cannot send more than 20 messages per campaign"),
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json(
      { error: "Authentication required to send RFQs" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid request body",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { status: 400 },
    );
  }

  try {
    // Load buyer identity from saved settings, fall back to session values
    const companySettings = await getCompanySettings(session.user.id).catch(() => null);

    const result = await sendProcurementRfqCampaign({
      baseUrl: new URL(request.url).origin,
      buyer: {
        buyerCompanyName:
          parsed.data.buyerCompanyName ??
          companySettings?.companyName ??
          null,
        buyerEmail:
          companySettings?.senderEmail ??
          session.user.email ??
          null,
        buyerName:
          companySettings?.senderName ??
          session.user.name ??
          null,
        buyerRole: companySettings?.senderRole ?? null,
        logoUrl: companySettings?.logoUrl ?? null,
        signature: companySettings?.signature ?? null,
      },
      messages: parsed.data.messages,
      requestId: parsed.data.requestId,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[send-rfq] Failed to send RFQ campaign", error);
    return Response.json(
      { error: "Failed to send RFQ campaign" },
      { status: 500 },
    );
  }
}
