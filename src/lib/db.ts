// Postgres client (Supabase) for server-side use only.
// Never imported into a Client Component — credentials stay on the server.
//
// Uses postgres.js against Supabase's transaction pooler (port 6543), which is
// the connection mode Vercel serverless functions should use.
//
// Env: DATABASE_URL = postgresql://postgres.<ref>:<pw>@<host>:6543/postgres

import "server-only";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly at first query rather than silently returning zeros.
  console.warn("[db] DATABASE_URL is not set — DB queries will throw.");
}

// One pooled client per server runtime. `prepare: false` is required for the
// Supabase transaction pooler (it does not support prepared statements).
declare global {
  // eslint-disable-next-line no-var
  var __wb_sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  global.__wb_sql ??
  postgres(connectionString ?? "", {
    prepare: false,
    // Serverless: each function instance handles one request at a time, so a
    // single connection is right. max:5 opened up to 5 slots per invocation and
    // exhausted the (shared, free-tier) Supabase pooler, hanging the page.
    max: 1,
    idle_timeout: 20,
    // Fail fast instead of hanging 40s+ if a pooler slot isn't available.
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") global.__wb_sql = sql;
