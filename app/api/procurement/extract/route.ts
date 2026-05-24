import {
  createEmptyProcurementExtraction,
  extractProcurementRequirements,
  procurementFieldSchema,
} from "@/lib/procurement-extraction"
import { z } from "zod"

const requestSchema = z
  .object({
    mode: z.enum(["fast", "fallback", "verify"]).optional(),
    prompt: z.string().max(6000),
    unresolvedFields: z.array(procurementFieldSchema).optional(),
  })
  .strict()

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json({ error: "Prompt is required" }, { status: 400 })
  }

  const prompt = parsed.data.prompt.trim()

  if (!prompt) {
    return Response.json(createEmptyProcurementExtraction())
  }

  if (
    !process.env.PROCUREMENT_FAST_SLM_ENDPOINT &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    return Response.json(
      { error: "Requirement extraction model is not configured" },
      { status: 503 }
    )
  }

  try {
    const extraction = await extractProcurementRequirements(
      prompt,
      parsed.data.unresolvedFields,
      { mode: parsed.data.mode ?? "fast" }
    )
    return Response.json(extraction)
  } catch (error) {
    console.error("Procurement extraction failed", error)
    return Response.json(
      { error: "Requirement extraction failed" },
      { status: 502 }
    )
  }
}
