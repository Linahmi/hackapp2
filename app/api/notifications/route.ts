import { auth } from "@/lib/auth";
import {
  listUnreadNotifications,
  markAllNotificationsRead,
} from "@/db/queries";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const notifications = await listUnreadNotifications(session.user.id);
  return Response.json({ notifications });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  await markAllNotificationsRead(session.user.id);
  return Response.json({ ok: true });
}
