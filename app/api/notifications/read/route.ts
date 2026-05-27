import { z } from "zod";

import { auth } from "@/lib/auth";
import { markNotificationRead } from "@/db/queries";

const bodySchema = z.object({
  notificationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "notificationId (UUID) is required" }, { status: 400 });
  }

  await markNotificationRead(parsed.data.notificationId, session.user.id);
  return Response.json({ ok: true });
}
