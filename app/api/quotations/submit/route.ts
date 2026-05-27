import { submitSupplierQuotation } from "@/lib/procurement-quotations";

function getIpAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await submitSupplierQuotation(
    body as never,
    {
      ipAddress: getIpAddress(request),
      userAgent: request.headers.get("user-agent"),
    },
  );

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        issues: "issues" in result ? result.issues : undefined,
      },
      { status: result.status },
    );
  }

  return Response.json(result);
}
