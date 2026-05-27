import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { approver } from "@/db/procurement-schema";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await context.params;

  const [deleted] = await db
    .delete(approver)
    .where(and(eq(approver.id, id), eq(approver.ownerId, session.user.id)))
    .returning();

  if (!deleted) return Response.json({ error: "Approver not found" }, { status: 404 });
  return Response.json({ ok: true });
}
