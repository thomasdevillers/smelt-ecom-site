import { createHash } from "node:crypto";
import { and, eq, isNull, or, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PaymentMode } from "./paystack-events";
import * as s from "./schema";
import { orderProjection } from "../orderProjection";

type Database = PgDatabase<PgQueryResultHKT, typeof s>;
// Use the shared database clock, rather than clocks on different Vercel workers,
// to order verification requests. Equal-millisecond observations retry safely.
export async function paymentObservationTime(db: Database) {
  const result = await db.execute(
    sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at`,
  );
  const [row] = (result as { rows: { at: string }[] }).rows;
  return row.at;
}
export class InvalidPaymentSnapshot extends Error {
  constructor() {
    super("Invalid verified payment snapshot.");
  }
}
export type ProviderTransaction = Record<string, unknown>;
export async function storePaymentCustomer(
  tx: Database,
  environment: PaymentMode,
  data: Record<string, unknown>,
  observedAt: string,
) {
  const customer = data.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const details = customer as Record<string, unknown>;
  if (
    !Number.isSafeInteger(details.id) ||
    Number(details.id) <= 0 ||
    typeof details.email !== "string"
  )
    return null;
  const id = String(details.id),
    created = details.created_at ?? details.createdAt;
  const createdAt =
    typeof created === "string" && Number.isFinite(Date.parse(created))
      ? new Date(created).toISOString()
      : null;
  await tx
    .insert(s.customers)
    .values({
      environment,
      id,
      email: details.email.trim().toLowerCase(),
      details,
      createdAt,
      observedAt,
    })
    .onConflictDoUpdate({
      target: [s.customers.environment, s.customers.id],
      set: { email: details.email.trim().toLowerCase(), details, observedAt },
      setWhere: sql`${s.customers.observedAt} is null or ${s.customers.observedAt} < ${observedAt}::timestamptz`,
    });
  return id;
}
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidPaymentSnapshot();
  return raw as Record<string, unknown>;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new InvalidPaymentSnapshot();
  return new Date(value).toISOString();
}
function money(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647)
    throw new InvalidPaymentSnapshot();
  return Number(value);
}
export function paymentObservation(
  raw: unknown,
  environment: PaymentMode,
  reference: string,
  observedAt: string,
) {
  const data = object(raw);
  if (
    data.domain !== environment ||
    data.reference !== reference ||
    !/^[a-zA-Z0-9_.=\-]{1,200}$/.test(reference) ||
    !Number.isSafeInteger(data.id) ||
    Number(data.id) <= 0 ||
    typeof data.currency !== "string" ||
    !/^[A-Z]{3}$/.test(data.currency)
  )
    throw new InvalidPaymentSnapshot();
  const statuses = {
    success: "success",
    reversed: "reversed",
    pending: "pending",
    ongoing: "pending",
    processing: "pending",
    queued: "pending",
    failed: "failed",
    abandoned: "failed",
  } as const;
  if (typeof data.status !== "string" || !Object.hasOwn(statuses, data.status))
    throw new InvalidPaymentSnapshot();
  let metadata: Record<string, unknown> = {};
  try {
    if (data.metadata)
      metadata = object(
        typeof data.metadata === "string" ? JSON.parse(data.metadata) : data.metadata,
      );
  } catch {
    throw new InvalidPaymentSnapshot();
  }
  const unitPriceMinor =
    metadata.unitPrice === undefined
      ? null
      : typeof metadata.unitPrice === "number"
        ? money(metadata.unitPrice * 100)
        : money(NaN);
  const items: {
    position: number;
    quantity: number;
    unitPriceMinor: number | null;
    currency: string;
    snapshot: Record<string, unknown>;
  }[] = [];
  if (metadata.items !== undefined && !Array.isArray(metadata.items))
    throw new InvalidPaymentSnapshot();
  const sourceItems =
    Array.isArray(metadata.items) && metadata.items.length
      ? metadata.items
      : metadata.cart
        ? Object.entries(object(metadata.cart))
            .filter(([, qty]) => qty !== 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([colour, qty]) => ({ colour, qty }))
        : [];
  for (const item of sourceItems) {
    const snapshot = object(item),
      quantity = money(snapshot.qty);
    if (!quantity) throw new InvalidPaymentSnapshot();
    items.push({
      position: items.length,
      quantity,
      unitPriceMinor,
      currency: data.currency,
      snapshot,
    });
  }
  return {
    reference,
    providerId: String(data.id),
    amountMinor: money(data.amount),
    currency: data.currency,
    paymentStatus: statuses[data.status as keyof typeof statuses],
    snapshot: data,
    createdAt: timestamp(data.created_at),
    paidAt: data.paid_at === null || data.paid_at === undefined ? null : timestamp(data.paid_at),
    observedAt: timestamp(observedAt),
    items,
    metadata,
  };
}

/** Provider request start time fences concurrent/out-of-order observations. Never
 * updates fulfilment dates, schedules emails, or runs stock/voucher operations. */
export async function savePaymentObservation(
  db: Database,
  environment: PaymentMode,
  reference: string,
  raw: unknown,
  observedAt: string,
) {
  const {
    items,
    metadata: _metadata,
    ...values
  } = paymentObservation(raw, environment, reference, observedAt);
  void _metadata;
  return db.transaction(async (tx) => {
    await tx
      .insert(s.environments)
      .values({ id: environment, paymentMode: environment })
      .onConflictDoNothing();
    const [namespace] = await tx
      .select()
      .from(s.environments)
      .where(eq(s.environments.id, environment));
    if (namespace?.paymentMode !== environment) throw new InvalidPaymentSnapshot();
    const identity = and(eq(s.orders.environment, environment), eq(s.orders.reference, reference));
    await tx
      .insert(s.orders)
      .values({ environment, reference, paymentStatus: "unknown", snapshot: {} })
      .onConflictDoNothing();
    const [prior] = await tx.select().from(s.orders).where(identity).for("update");
    if (prior.providerId && prior.providerId !== values.providerId)
      throw new InvalidPaymentSnapshot();
    const id = createHash("sha256")
      .update(JSON.stringify({ reference, observedAt, raw }))
      .digest("hex");
    await tx
      .insert(s.paymentSnapshots)
      .values({
        environment,
        id,
        orderReference: reference,
        observedAt,
        source: "verification",
        payload: values.snapshot,
      })
      .onConflictDoNothing();
    if (prior.observedAt && Date.parse(prior.observedAt) >= Date.parse(observedAt)) return false;
    const customerId = await storePaymentCustomer(tx, environment, values.snapshot, observedAt);
    await tx
      .update(s.paymentAdjustments)
      .set({ reference })
      .where(
        and(
          eq(s.paymentAdjustments.environment, environment),
          isNull(s.paymentAdjustments.reference),
          sql`${s.paymentAdjustments.payload}->>'transaction' = ${values.providerId}`,
        ),
      );
    const [adjustment] = await tx
      .select({ kind: s.paymentAdjustments.kind })
      .from(s.paymentAdjustments)
      .where(
        and(
          eq(s.paymentAdjustments.environment, environment),
          eq(s.paymentAdjustments.reference, reference),
          or(eq(s.paymentAdjustments.kind, "dispute"), ne(s.paymentAdjustments.status, "failed")),
        ),
      )
      .limit(1);
    await tx
      .update(s.orders)
      .set({
        ...values,
        ...orderProjection(values.snapshot),
        customerId,
        ...(adjustment ? { paymentReview: adjustment.kind } : {}),
      })
      .where(identity);
    await tx
      .delete(s.orderItems)
      .where(and(eq(s.orderItems.environment, environment), eq(s.orderItems.reference, reference)));
    if (items.length)
      await tx
        .insert(s.orderItems)
        .values(items.map((item) => ({ ...item, environment, reference })));
    return true;
  });
}
