import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "../lib/env";
import * as authSchema from "./schema";
import * as procurementSchema from "./procurement-schema";

/**
 * Neon HTTP client.
 *
 * The HTTP driver is the right choice for Next.js serverless routes:
 * - Zero idle connections (important for Neon's autoscale-to-zero)
 * - Works in edge and Node.js runtimes
 * - db.batch() is available for grouped writes over the HTTP driver
 *
 * If you need true interactive transactions (BEGIN/COMMIT) for complex
 * multi-step workflows, switch to drizzle-orm/neon-serverless with the
 * WebSocket Pool driver. For the current RFQ workflow, the HTTP driver
 * and careful application-level ordering is sufficient.
 */
const sql = neon(env.DATABASE_URL);

// Both schema namespaces are merged here so the relational query API
// (db.query.procurementRequest, db.query.supplier, etc.) works across
// the auth and procurement models.
export const db = drizzle(sql, {
  schema: {
    ...authSchema,
    ...procurementSchema,
  },
});

export type Db = typeof db;
