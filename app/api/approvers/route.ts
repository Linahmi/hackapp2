import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  createApprover,
  getUserByEmail,
  listApproversForOwner,
} from "@/db/queries";

const addSchema = z.object({
  email: z.string().trim().email("Must be a valid email address"),
  thresholdAmount: z.coerce.number().positive().optional().nullable(),
  thresholdCurrency: z.string().trim().max(8).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const approvers = await listApproversForOwner(session.user.id);
  return Response.json({ approvers });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  let body: unknown;
  try { body = await request.json() } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  if (parsed.data.email.toLowerCase() === session.user.email?.toLowerCase()) {
    return Response.json({ error: "You cannot add yourself as an approver" }, { status: 400 });
  }

  const approverUser = await getUserByEmail(parsed.data.email);
  if (!approverUser) {
    return Response.json(
      { error: "No user found with this email. They need to sign up for Procora first." },
      { status: 404 },
    );
  }

  try {
    const row = await createApprover({
      ownerId: session.user.id,
      approverUserId: approverUser.id,
      thresholdAmount: parsed.data.thresholdAmount != null
        ? String(parsed.data.thresholdAmount)
        : null,
      thresholdCurrency: parsed.data.thresholdCurrency ?? null,
    });
    return Response.json({ approver: { ...row, approverUser } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return Response.json({ error: "This user is already an approver" }, { status: 409 });
    }
    throw err;
  }
}
