// Order persistence. All functions are safe no-ops when DATABASE_URL is unset,
// so the app runs (and takes pre-orders) before the datastore is provisioned.
import { ensureSchema, getPool, isDbConfigured } from "./db";

export interface OrderItem {
  colour: string;
  name: string;
  qty: number;
}

export interface RecordOrderInput {
  reference: string;
  email: string;
  amountRand: number;
  currency?: string;
  status: string;
  items: OrderItem[];
  paidAt?: string | null;
}

/**
 * Insert or update an order keyed by its Paystack reference. Idempotent: the
 * checkout redirect and the webhook may both report the same payment, so we
 * upsert rather than duplicate. Returns true if the row is newly paid (useful
 * for firing a notification exactly once), false otherwise.
 */
export async function recordOrder(input: RecordOrderInput): Promise<boolean> {
  if (!isDbConfigured()) return false;
  await ensureSchema();

  const { rows } = await getPool().query(
    `
    INSERT INTO orders (reference, email, amount_rand, currency, status, items, paid_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    ON CONFLICT (reference) DO UPDATE
      SET status  = EXCLUDED.status,
          paid_at = COALESCE(orders.paid_at, EXCLUDED.paid_at),
          email   = EXCLUDED.email
    RETURNING (xmax = 0) AS inserted, status, paid_at
    `,
    [
      input.reference,
      input.email,
      input.amountRand,
      input.currency ?? "ZAR",
      input.status,
      JSON.stringify(input.items ?? []),
      input.paidAt ?? null,
    ],
  );

  const row = rows[0];
  // Newly paid = freshly inserted with a success status.
  return Boolean(row?.inserted) && input.status === "success";
}
