import {
  companyDetailsRequestSchema,
  companyDetailsResponseSchema,
  getProcurementCompanyDetails,
} from "@/lib/procurement-workflow"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = companyDetailsRequestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid procurement company details request",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { status: 400 }
    )
  }

  try {
    const details = await getProcurementCompanyDetails(parsed.data)
    return Response.json(companyDetailsResponseSchema.parse(details))
  } catch (error) {
    console.error("Procurement company details failed", error)
    return Response.json(
      { error: "Company details lookup failed" },
      { status: 502 }
    )
  }
}
