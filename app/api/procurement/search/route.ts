import {
  procurementSearchRequestSchema,
  runProcurementSearch,
} from "@/lib/procurement-search"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = procurementSearchRequestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid procurement search request",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      },
      { status: 400 }
    )
  }

  try {
    const result = await runProcurementSearch(parsed.data)

    if (result.error) {
      return Response.json({ error: result.error }, { status: result.status ?? 400 })
    }

    return Response.json(result.response)
  } catch (error) {
    console.error("Procurement supplier search failed", error)
    return Response.json(
      { error: "Supplier search failed" },
      { status: 502 }
    )
  }
}
