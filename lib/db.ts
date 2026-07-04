// Server-only Postgres access. Works with any Postgres (Neon, Supabase, etc.)
// via a single DATABASE_URL connection string.
//
// Set DATABASE_URL in .env.local to enable order persistence. Until then,
// isDbConfigured() returns false and callers skip the database gracefully.
import { Pool } from "pg";

let pool: Pool | null = null;

/** True once a connection string is configured. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Lazily-created singleton pool. Reused across requests in a warm server. */
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon/Supabase pooled endpoints require SSL. `no-verify` avoids CA
      // bundle hassles; the connection is still encrypted.
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

let schemaReady: Promise<void> | null = null;

/**
 * Create the orders table if it doesn't exist. Runs at most once per process.
 * Cheap enough to call before each write; the promise is memoized.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS orders (
          id            BIGSERIAL PRIMARY KEY,
          reference     TEXT NOT NULL UNIQUE,
          email         TEXT NOT NULL,
          amount_rand   INTEGER NOT NULL,
          currency      TEXT NOT NULL DEFAULT 'ZAR',
          status        TEXT NOT NULL,
          items         JSONB NOT NULL DEFAULT '[]'::jsonb,
          paid_at       TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await getPool().query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS customer_name      TEXT,
          ADD COLUMN IF NOT EXISTS shipping_address    JSONB,
          ADD COLUMN IF NOT EXISTS fulfillment_status  TEXT NOT NULL DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS tracking_number     TEXT,
          ADD COLUMN IF NOT EXISTS tracking_carrier    TEXT,
          ADD COLUMN IF NOT EXISTS tracking_url        TEXT,
          ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ;
      `);

      await getPool().query(`
        CREATE TABLE IF NOT EXISTS abandoned_carts (
          id           BIGSERIAL PRIMARY KEY,
          email        TEXT NOT NULL UNIQUE,
          name         TEXT,
          items        JSONB NOT NULL DEFAULT '[]'::jsonb,
          amount_rand  INTEGER NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          reminded_at  TIMESTAMPTZ,
          converted_at TIMESTAMPTZ
        );
      `);

      await getPool().query(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id         BIGSERIAL PRIMARY KEY,
          email      TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    })().catch((err) => {
      // Reset so a later request can retry after a transient failure.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
