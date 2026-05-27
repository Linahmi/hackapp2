/**
 * Mailgun REST client — zero external dependencies, pure fetch.
 *
 * Uses the Mailgun v3 Messages API:
 * https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages/
 *
 * EU customers: set MAILGUN_API_BASE=https://api.eu.mailgun.net in .env
 *
 * Required env vars:
 *   MAILGUN_API_KEY    — your Mailgun private API key
 *   MAILGUN_DOMAIN     — your verified sending domain (e.g. mg.procora.com)
 *   MAILGUN_FROM       — display sender (e.g. "Procora RFQ <rfq@mg.procora.com>")
 */

import { createHmac } from "crypto";
import { env } from "./env";

const API_BASE = env.MAILGUN_API_BASE ?? "https://api.mailgun.net";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type MailgunSendResult =
  | { ok: true; mailgunMessageId: string }
  | { ok: false; error: string };

export type MailgunWebhookEvent =
  | "delivered"
  | "failed"
  | "opened"
  | "clicked"
  | "complained"
  | "unsubscribed"
  | "stored";

export type MailgunWebhookPayload = {
  signature: {
    timestamp: string;
    token: string;
    signature: string;
  };
  "event-data": {
    event: MailgunWebhookEvent;
    id: string;
    timestamp: number;
    "log-level"?: string;
    reason?: string;
    message: {
      headers: {
        "message-id": string;
        to?: string;
        from?: string;
        subject?: string;
      };
    };
    "delivery-status"?: {
      message?: string;
      code?: number;
      description?: string;
    };
  };
};

// ─────────────────────────────────────────────────────────────
// Send
// ─────────────────────────────────────────────────────────────

/**
 * Send a single RFQ email via Mailgun.
 *
 * Returns { ok: true, mailgunMessageId } on success.
 * Returns { ok: false, error } on any failure — never throws.
 */
export async function sendRfqEmail({
  html,
  replyTo,
  to,
  subject,
  text,
}: {
  html?: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
}): Promise<MailgunSendResult> {
  const { MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM } = env;

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAILGUN_FROM) {
    return {
      ok: false,
      error:
        "Mailgun is not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM in your environment.",
    };
  }

  const form = new FormData();
  form.append("from", MAILGUN_FROM);
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);
  if (html) form.append("html", html);
  if (replyTo) form.append("h:Reply-To", replyTo);
  // Track opens so we can fire the OPENED webhook event
  form.append("o:tracking-opens", "yes");

  try {
    const response = await fetch(
      `${API_BASE}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          // Mailgun uses HTTP Basic Auth: username="api", password=API_KEY
          Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
        },
        body: form,
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: data.message ?? `Mailgun API error ${response.status}`,
      };
    }

    return {
      ok: true,
      // Mailgun returns the ID as "<localpart@mailgun.org>"
      mailgunMessageId: data.id ?? "",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Mailgun request failed",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Webhook signature verification
// ─────────────────────────────────────────────────────────────

/**
 * Verify a Mailgun webhook signature using HMAC-SHA256.
 * The signing key is distinct from the API key — find it in:
 *   Mailgun dashboard → Settings → Webhooks → Signing key
 *
 * Returns true if the signature is valid.
 * Always returns true if MAILGUN_WEBHOOK_SIGNING_KEY is not set
 * (allows receiving webhooks during development without the key).
 */
export function verifyMailgunSignature(
  payload: MailgunWebhookPayload["signature"],
): boolean {
  const signingKey = env.MAILGUN_WEBHOOK_SIGNING_KEY;

  if (!signingKey) {
    // Not configured — log a warning and pass through
    console.warn(
      "[mailgun] MAILGUN_WEBHOOK_SIGNING_KEY not set; skipping signature verification.",
    );
    return true;
  }

  const { timestamp, token, signature } = payload;
  const value = timestamp + token;
  const expected = createHmac("sha256", signingKey).update(value).digest("hex");

  return expected === signature;
}
