import { auth } from "@/lib/auth";
import { getBuyerQuotations } from "@/lib/procurement-quotations";
import { getRequestById } from "@/db/queries";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { requestId } = await context.params;
  const procurementRequest = await getRequestById(requestId);

  if (!procurementRequest) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }

  if (
    procurementRequest.userId &&
    procurementRequest.userId !== session.user.id
  ) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const quotations = await getBuyerQuotations(requestId);
  return Response.json({
    quotations,
    request: {
      id: procurementRequest.id,
      title: procurementRequest.title,
      status: procurementRequest.status,
    },
  });
}
