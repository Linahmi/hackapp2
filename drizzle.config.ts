import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  out: "./drizzle",
  // Both schema files: auth (managed by better-auth) + procurement (our models).
  // Never put procurement models in schema.ts — `auth:generate` will overwrite it.
  schema: ["./db/schema.ts", "./db/procurement-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Only manage tables that belong to Procora.
  // Mastra creates its own tables (mastra_threads, mastra_messages, etc.)
  // via @mastra/pg — those are managed by Mastra's own migration system,
  // not ours. The `!` prefix means "exclude from management".
  tablesFilter: ["!mastra_*"],
  // Verbose output helps diagnose migration issues against Neon
  verbose: true,
  strict: false,
});
