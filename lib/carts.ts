// lib/carts.ts
import { ensureSchema, getPool, isDbConfigured } from "./db";
import type { OrderItem } from "./orders";

export interface AbandonedCart {
  email: string;
  name: string | null;
  items: OrderItem[];
  amountRand: number;
}

// Carts are keyed by email, so normalize casing here — the checkout/track path
// and the payment path (Paystack echoes back the customer email) may present
// the same address with different casing. Lowercasing at every entry point
// keeps the "upsert" and "mark converted" operations hitting the same row.
function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Upsert a cart by email. New/changed content clears any prior reminder. */
export async function trackCart(input: {
  email: string; name?: string | null; items: OrderItem[]; amountRand: number;
}): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  await getPool().query(
    `INSERT INTO abandoned_carts (email, name, items, amount_rand)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (email) DO UPDATE
       SET name=EXCLUDED.name, items=EXCLUDED.items, amount_rand=EXCLUDED.amount_rand,
           updated_at=now(), reminded_at=NULL
       WHERE abandoned_carts.converted_at IS NULL`,
    [normEmail(input.email), input.name ?? null, JSON.stringify(input.items), input.amountRand],
  );
}

export async function markCartConverted(email: string): Promise<void> {
  if (!isDbConfigured() || !email) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE abandoned_carts SET converted_at=now() WHERE email=$1 AND converted_at IS NULL`,
    [normEmail(email)],
  );
}

/** Carts older than `minutes`, not converted, not yet reminded. */
export async function findAbandonedCarts(minutes: number): Promise<AbandonedCart[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT email,name,items,amount_rand FROM abandoned_carts
     WHERE converted_at IS NULL AND reminded_at IS NULL
       AND updated_at < now() - ($1 || ' minutes')::interval
       AND amount_rand > 0`,
    [String(minutes)],
  );
  return rows.map((r) => ({
    email: r.email, name: r.name, items: r.items ?? [], amountRand: r.amount_rand,
  }));
}

export async function stampReminded(email: string): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  await getPool().query(
    `UPDATE abandoned_carts SET reminded_at=now() WHERE email=$1`, [normEmail(email)],
  );
}
