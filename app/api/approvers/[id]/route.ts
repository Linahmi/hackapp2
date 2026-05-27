import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { approver } from "@/db/procurement-schema";
import { countPendingApprovalsForApprover } from "@/db/queries";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;

  // Fetch the record first so we can check pending approvals before deleting
  const existing = await db.query.approver.findFirst({
    where: and(eq(approver.id, id), eq(approver.ownerId, session.user.id)),
  });
  if (!existing) return Response.json({ error: "Approver not found" }, { status: 404 });

  // Block deletion if this approver has outstanding pending approvals
  const pendingCount = await countPendingApprovalsForApprover(existing.approverUserId);
  if (pendingCount > 0) {
    return Response.json(
      {
        error: `This approver has ${pendingCount} pending approval${pendingCount !== 1 ? "s" : ""}. Resolve them before removing.`,
        pendingCount,
      },
      { status: 409 },
    );
  }

  await db
    .delete(approver)
    .where(and(eq(approver.id, id), eq(approver.ownerId, session.user.id)));

  return Response.json({ ok: true });
}
