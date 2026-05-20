import {
  generateProcurementQuote,
  quoteRequestSchema,
} from "@/lib/procurement-workflow"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = quoteRequestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid procurement quote request",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { status: 400 }
    )
  }

  try {
    return Response.json(generateProcurementQuote(parsed.data))
  } catch (error) {
    console.error("Procurement quote generation failed", error)
    return Response.json(
      { error: "Quotation generation failed" },
      { status: 502 }
    )
  }
}
