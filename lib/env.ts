import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Must be a PostgreSQL connection string (Neon or compatible).
  // Never defaults to a local SQLite path — a missing DATABASE_URL is always
  // a hard error so misconfigured deployments fail loudly at startup.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(1).default("development-secret-change-me"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  // Optional — populated when Mailgun is integrated
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  MAILGUN_FROM: z.string().optional(),
  MAILGUN_REGION: z.enum(["us", "eu"]).optional(),
  // Mailgun webhook signing key (Settings → Webhooks in Mailgun dashboard)
  MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),
  // EU customers: https://api.eu.mailgun.net (auto-set by MAILGUN_REGION=eu)
  MAILGUN_API_BASE: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  // S3-compatible storage (AWS S3 or Cloudflare R2)
  // If STORAGE_ENDPOINT is set, it overrides the default AWS endpoint (use for R2/MinIO).
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  // Public base URL for uploaded objects, e.g. https://pub-xxx.r2.dev or https://bucket.s3.amazonaws.com
  STORAGE_PUBLIC_URL: z.string().url().optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  EXA_API_KEY: process.env.EXA_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
  MAILGUN_FROM: process.env.MAILGUN_FROM,
  MAILGUN_REGION: process.env.MAILGUN_REGION as "us" | "eu" | undefined,
  MAILGUN_WEBHOOK_SIGNING_KEY: process.env.MAILGUN_WEBHOOK_SIGNING_KEY,
  MAILGUN_API_BASE: process.env.MAILGUN_API_BASE,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
  STORAGE_REGION: process.env.STORAGE_REGION,
  STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  STORAGE_PUBLIC_URL: process.env.STORAGE_PUBLIC_URL,
});
