import { auth } from "@/lib/auth";
import { listRequestsByUser } from "@/db/queries";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const requests = await listRequestsByUser(session.user.id, limit, offset);

  return Response.json({
    requests: requests.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      sentAt: r.campaigns.find((c) => c.sentAt)?.sentAt ?? null,
      campaignCount: r.campaigns.length,
    })),
  });
}
