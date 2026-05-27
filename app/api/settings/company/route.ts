import { z } from "zod";

import { auth } from "@/lib/auth";
import { getCompanySettings, upsertCompanySettings } from "@/db/queries";

const updateSchema = z
  .object({
    companyName: z.string().trim().max(200).nullable().optional(),
    senderName: z.string().trim().max(200).nullable().optional(),
    senderRole: z.string().trim().max(200).nullable().optional(),
    senderEmail: z.string().trim().email().nullable().optional(),
    logoUrl: z.string().trim().url().nullable().optional(),
    signature: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getCompanySettings(session.user.id);
  return Response.json(settings ?? {});
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const settings = await upsertCompanySettings(session.user.id, parsed.data);
  return Response.json(settings);
}
