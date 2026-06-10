import { Pool } from "pg";

// Reuse a single pool across hot-reloads in dev (Next.js re-evaluates modules).
const globalForPg = globalThis as unknown as { __pgPool?: Pool };

export const pool =
  globalForPg.__pgPool ??
  new Pool(
    // Prefer a single DATABASE_URL; otherwise pg reads PGHOST/PGUSER/PGPASSWORD/
    // PGDATABASE/PGPORT from the environment automatically (no URL-encoding needed).
    process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
  );

if (process.env.NODE_ENV !== "production") globalForPg.__pgPool = pool;

/** Convenience query helper returning typed rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params as unknown[]);
  return res.rows as T[];
}
