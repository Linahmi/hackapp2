import { auth } from "@/lib/auth";
import { listPendingApprovalsForApprover } from "@/db/queries";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const approvals = await listPendingApprovalsForApprover(session.user.id);
  return Response.json({ approvals });
}
