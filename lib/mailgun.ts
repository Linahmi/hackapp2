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

import { createHash, createHmac } from "crypto";
import { env } from "./env";

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

type MailgunRuntimeConfig = {
  apiBase: string;
  apiBaseSource: "env" | "region" | "default-us" | "eu-fallback";
  apiKey: string;
  domain: string;
  from: string;
};

type MailgunApiResponse = {
  id?: string;
  message?: string;
};

function cleanMailgunValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const quote = trimmed[0];
  if (
    (quote === `"` || quote === "'") &&
    trimmed.endsWith(quote) &&
    trimmed.length > 1
  ) {
    return trimmed.slice(1, -1).trim() || null;
  }

  return trimmed;
}

function normalizeMailgunDomain(value?: string | null) {
  const cleaned = cleanMailgunValue(value);
  if (!cleaned) return null;

  const withoutProtocol = cleaned.replace(/^https?:\/\//i, "");
  const host = withoutProtocol
    .split(/[/?#]/)[0]
    ?.trim()
    .replace(/^@/, "")
    .toLowerCase();

  return host || null;
}

function normalizeMailgunApiBase() {
  const configuredBase = cleanMailgunValue(env.MAILGUN_API_BASE);
  if (configuredBase) {
    return {
      apiBase: configuredBase.replace(/\/+$/, ""),
      apiBaseSource: "env" as const,
    };
  }

  if (env.MAILGUN_REGION === "eu") {
    return {
      apiBase: "https://api.eu.mailgun.net",
      apiBaseSource: "region" as const,
    };
  }

  return {
    apiBase: "https://api.mailgun.net",
    apiBaseSource: "default-us" as const,
  };
}

function buildMailgunSenderForDomain(displayName: string | null | undefined, domain: string) {
  const cleanedName =
    cleanMailgunValue(displayName)
      ?.replaceAll("<", "")
      .replaceAll(">", "")
      .replace(/\s+/g, " ") || "Procora RFQ";

  return `${cleanedName} <noreply@${domain}>`;
}

export function buildMailgunSender(displayName?: string | null) {
  const domain = normalizeMailgunDomain(env.MAILGUN_DOMAIN);
  if (!domain) return undefined;
  return buildMailgunSenderForDomain(displayName, domain);
}

export function isMailgunConfigured() {
  return Boolean(
    cleanMailgunValue(env.MAILGUN_API_KEY) &&
      normalizeMailgunDomain(env.MAILGUN_DOMAIN),
  );
}

function getMailgunRuntimeConfig(fromOverride?: string | null) {
  const apiKey = cleanMailgunValue(env.MAILGUN_API_KEY);
  const domain = normalizeMailgunDomain(env.MAILGUN_DOMAIN);

  if (!apiKey || !domain) {
    return {
      config: null,
      missing: [
        !apiKey ? "MAILGUN_API_KEY" : null,
        !domain ? "MAILGUN_DOMAIN" : null,
      ].filter(Boolean) as string[],
    };
  }

  const apiBase = normalizeMailgunApiBase();

  return {
    config: {
      ...apiBase,
      apiKey,
      domain,
      from:
        cleanMailgunValue(fromOverride) ??
        cleanMailgunValue(env.MAILGUN_FROM) ??
        buildMailgunSenderForDomain("Procora RFQ", domain),
    } satisfies MailgunRuntimeConfig,
    missing: [],
  };
}

async function readMailgunResponse(response: Response): Promise<MailgunApiResponse> {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text) as MailgunApiResponse;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function mailgunKeyFingerprint(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 10);
}

function getMailgunFailureMessage(response: Response, message?: string) {
  if (response.status === 401) {
    return [
      "Mailgun authentication failed (401).",
      "Verify MAILGUN_API_KEY is the private API key, MAILGUN_DOMAIN is the verified sending domain,",
      "and MAILGUN_REGION/MAILGUN_API_BASE matches the Mailgun account region.",
      "EU domains require MAILGUN_REGION=eu or MAILGUN_API_BASE=https://api.eu.mailgun.net.",
    ].join(" ");
  }

  return message
    ? `Mailgun API error ${response.status}: ${message}`
    : `Mailgun API error ${response.status}`;
}

function logMailgunFailure(
  response: Response,
  config: MailgunRuntimeConfig,
  apiMessage?: string,
) {
  const apiHost = new URL(config.apiBase).host;

  console.error("[mailgun] Send failed", {
    apiHost,
    apiMessage,
    apiBaseSource: config.apiBaseSource,
    domain: config.domain,
    keyFingerprint: mailgunKeyFingerprint(config.apiKey),
    keyLength: config.apiKey.length,
    region: env.MAILGUN_REGION ?? "us",
    status: response.status,
    statusText: response.statusText,
  });
}

function buildMailgunForm(
  config: MailgunRuntimeConfig,
  input: {
    html?: string;
    replyTo?: string;
    subject: string;
    text: string;
    to: string;
  },
) {
  const form = new FormData();
  form.append("from", config.from);
  form.append("to", input.to);
  form.append("subject", input.subject);
  form.append("text", input.text);
  if (input.html) form.append("html", input.html);
  if (input.replyTo) form.append("h:Reply-To", input.replyTo);
  // Track opens so we can fire the OPENED webhook event
  form.append("o:tracking-opens", "yes");
  return form;
}

async function postMailgunMessage(
  config: MailgunRuntimeConfig,
  input: {
    html?: string;
    replyTo?: string;
    subject: string;
    text: string;
    to: string;
  },
) {
  const response = await fetch(
    `${config.apiBase}/v3/${encodeURIComponent(config.domain)}/messages`,
    {
      method: "POST",
      headers: {
        // Mailgun uses HTTP Basic Auth: username="api", password=API_KEY
        Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}`,
      },
      body: buildMailgunForm(config, input),
    },
  );

  return {
    data: await readMailgunResponse(response),
    response,
  };
}

function shouldRetryEuEndpoint(config: MailgunRuntimeConfig, response: Response) {
  return response.status === 401 && config.apiBaseSource === "default-us";
}

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
  from: fromOverride,
  html,
  replyTo,
  to,
  subject,
  text,
}: {
  from?: string;
  html?: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
}): Promise<MailgunSendResult> {
  const { config, missing } = getMailgunRuntimeConfig(fromOverride);

  if (!config) {
    return {
      ok: false,
      error: `Mailgun is not configured. Set ${missing.join(" and ")} in your environment.`,
    };
  }

  try {
    const { data, response } = await postMailgunMessage(config, {
      html,
      replyTo,
      subject,
      text,
      to,
    });

    if (shouldRetryEuEndpoint(config, response)) {
      const euConfig: MailgunRuntimeConfig = {
        ...config,
        apiBase: "https://api.eu.mailgun.net",
        apiBaseSource: "eu-fallback",
      };

      console.warn("[mailgun] US endpoint authentication failed; retrying EU endpoint.", {
        domain: config.domain,
        keyFingerprint: mailgunKeyFingerprint(config.apiKey),
      });

      const retry = await postMailgunMessage(euConfig, {
        html,
        replyTo,
        subject,
        text,
        to,
      });

      if (retry.response.ok) {
        console.warn(
          "[mailgun] Send succeeded via EU endpoint fallback. Set MAILGUN_REGION=eu in deployment.",
          { domain: config.domain },
        );

        return {
          ok: true,
          mailgunMessageId: retry.data.id ?? "",
        };
      }

      logMailgunFailure(response, config, data.message);
      logMailgunFailure(retry.response, euConfig, retry.data.message);

      return {
        ok: false,
        error: getMailgunFailureMessage(retry.response, retry.data.message),
      };
    }

    if (!response.ok) {
      logMailgunFailure(response, config, data.message);

      return {
        ok: false,
        error: getMailgunFailureMessage(response, data.message),
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
