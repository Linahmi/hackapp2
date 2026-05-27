# Procora

AI-powered procurement platform built with Next.js, Drizzle ORM, and Neon Postgres.

## Getting started

```bash
bun install
cp .env.example .env.local   # fill in all required vars
bun run db:push               # push schema to Neon
bun run dev
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | ✅ | Auth session secret |
| `BETTER_AUTH_URL` | ✅ | App base URL (e.g. `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth client secret |
| `EXA_API_KEY` | ✅ | Exa supplier search |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ | Gemini for structured extraction |
| `MAILGUN_API_KEY` | optional | Transactional email |
| `MAILGUN_DOMAIN` | optional | Sending domain |
| `MAILGUN_FROM` | optional | Default FROM address |
| `MAILGUN_REGION` | optional | `us` or `eu` |
| `STORAGE_ENDPOINT` | optional | R2/MinIO endpoint URL |
| `STORAGE_REGION` | optional | `auto` for R2, or AWS region |
| `STORAGE_ACCESS_KEY_ID` | optional | S3/R2 access key |
| `STORAGE_SECRET_ACCESS_KEY` | optional | S3/R2 secret key |
| `STORAGE_BUCKET` | optional | Bucket name |
| `STORAGE_PUBLIC_URL` | optional | Public base URL for objects |
| `NEXT_PUBLIC_APP_URL` | optional | Overrides `BETTER_AUTH_URL` for email links |

## File storage (S3 / Cloudflare R2)

Supplier quotation attachments are uploaded **directly from the browser** to S3 or R2 via presigned PUT URLs. No file bytes pass through the Next.js server.

### Bucket privacy

Buckets **should be private** (no public read ACL). Object keys contain a UUID segment (`quotations/<uuid>/<filename>`) making them unguessable, but for commercial quotations private-by-default is the correct posture. Buyer-side download links should use short-lived presigned GET URLs (not yet implemented — buyers currently access `attachmentUrl` directly, which requires the bucket to be public).

### Required CORS configuration

The browser PUT will be blocked unless the bucket allows cross-origin requests from your app domain. Configure this before enabling file uploads.

#### Cloudflare R2

In the R2 bucket settings → **CORS Policy**, paste:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

For local development, add `"http://localhost:3000"` to `AllowedOrigins`.

#### AWS S3

In the S3 bucket → **Permissions** → **Cross-origin resource sharing (CORS)**, paste:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

#### Diagnosing CORS errors

If a supplier sees **"Upload blocked — storage CORS is not configured"**, the browser's preflight OPTIONS request was rejected. Check:

1. The bucket CORS policy includes the exact origin (no trailing slash).
2. `PUT` is in `AllowedMethods`.
3. `Content-Type` is in `AllowedHeaders`.
4. The presigned URL host matches what the browser expects (for R2, `STORAGE_ENDPOINT` must be set to `https://<accountId>.r2.cloudflarestorage.com`).

The browser DevTools Network tab will show a failed OPTIONS preflight with the specific origin and method that was blocked.

## Tech stack

- **Next.js 16** — App Router, React Server Components
- **Drizzle ORM + Neon** — Postgres, `db:push` schema management
- **better-auth** — Google OAuth
- **Mailgun** — transactional email (RFQ campaigns, approvals, confirmations)
- **AWS SDK v3** — S3/R2 presigned URLs
- **Exa** — supplier search
- **Gemini** — structured request extraction
