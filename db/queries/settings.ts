import { eq } from "drizzle-orm";

import { db } from "../index";
import { companySettings, type CompanySettings } from "../procurement-schema";

export type CompanySettingsInput = Partial<
  Pick<
    CompanySettings,
    "companyName" | "senderName" | "senderRole" | "senderEmail" | "logoUrl" | "signature"
  >
>;

export async function getCompanySettings(userId: string): Promise<CompanySettings | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.userId, userId),
  });
  return row ?? null;
}

export async function upsertCompanySettings(
  userId: string,
  data: CompanySettingsInput,
): Promise<CompanySettings> {
  const [row] = await db
    .insert(companySettings)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: companySettings.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert company settings");
  return row;
}
