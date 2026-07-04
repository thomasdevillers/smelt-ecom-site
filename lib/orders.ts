// Order persistence. All functions are safe no-ops when DATABASE_URL is unset,
// so the app runs (and takes pre-orders) before the datastore is provisioned.
import { ensureSchema, getPool, isDbConfigured } from "./db";
import type { ShippingAddress } from "./address";

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
  customerName?: string | null;
  shippingAddress?: ShippingAddress | null;
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
    INSERT INTO orders
      (reference, email, amount_rand, currency, status, items, paid_at, customer_name, shipping_address)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
    ON CONFLICT (reference) DO UPDATE
      SET status           = EXCLUDED.status,
          paid_at          = COALESCE(orders.paid_at, EXCLUDED.paid_at),
          email            = EXCLUDED.email,
          customer_name    = COALESCE(EXCLUDED.customer_name, orders.customer_name),
          shipping_address = COALESCE(EXCLUDED.shipping_address, orders.shipping_address)
    RETURNING (xmax = 0) AS inserted, status, paid_at
    `,
    [
      input.reference, input.email, input.amountRand, input.currency ?? "ZAR",
      input.status, JSON.stringify(input.items ?? []), input.paidAt ?? null,
      input.customerName ?? null,
      input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
    ],
  );

  const row = rows[0];
  // Newly paid = freshly inserted with a success status.
  return Boolean(row?.inserted) && input.status === "success";
}

export interface Order {
  reference: string;
  email: string;
  customerName: string | null;
  amountRand: number;
  status: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress | null;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrder(r: any): Order {
  return {
    reference: r.reference, email: r.email, customerName: r.customer_name,
    amountRand: r.amount_rand, status: r.status, items: r.items ?? [],
    shippingAddress: r.shipping_address, fulfillmentStatus: r.fulfillment_status,
    trackingNumber: r.tracking_number, trackingCarrier: r.tracking_carrier,
    trackingUrl: r.tracking_url, paidAt: r.paid_at, shippedAt: r.shipped_at,
    deliveredAt: r.delivered_at, createdAt: r.created_at,
  };
}

export async function listOrders(limit = 200): Promise<Order[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [limit],
  );
  return rows.map(mapOrder);
}

export async function markShipped(
  reference: string,
  t: { carrier: string; trackingNumber: string; trackingUrl?: string },
): Promise<Order | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `UPDATE orders SET fulfillment_status='shipped', tracking_carrier=$2,
       tracking_number=$3, tracking_url=$4, shipped_at=COALESCE(shipped_at, now())
     WHERE reference=$1 RETURNING *`,
    [reference, t.carrier, t.trackingNumber, t.trackingUrl ?? null],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function markDelivered(reference: string): Promise<Order | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const { rows } = await getPool().query(
    `UPDATE orders SET fulfillment_status='delivered',
       delivered_at=COALESCE(delivered_at, now()) WHERE reference=$1 RETURNING *`,
    [reference],
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}
