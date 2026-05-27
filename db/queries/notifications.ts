import { and, eq, isNull } from "drizzle-orm";

import { db } from "../index";
import { notification, type Notification, type NewNotification } from "../procurement-schema";

export type { Notification };

export async function createNotification(
  data: Pick<NewNotification, "userId" | "type" | "payload">,
): Promise<Notification> {
  const [row] = await db
    .insert(notification)
    .values({
      userId: data.userId,
      type: data.type,
      payload: data.payload ?? {},
    })
    .returning();
  if (!row) throw new Error("Failed to create notification");
  return row;
}

export async function listUnreadNotifications(userId: string): Promise<Notification[]> {
  return db.query.notification.findMany({
    where: and(eq(notification.userId, userId), isNull(notification.readAt)),
    orderBy: (t, { desc }) => desc(t.createdAt),
    limit: 50,
  });
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}
