import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PaymentMode } from "./paystack-events";
import { InvalidPaymentSnapshot } from "./payment-observations";
import * as s from "./schema";
type Database = PgDatabase<PgQueryResultHKT, typeof s>;

export async function savePaymentAdjustment(db: Database, environment: PaymentMode, kind: "refund" | "dispute", raw: unknown, observedAt: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidPaymentSnapshot();
  const data = raw as Record<string, unknown>;
  if (data.domain !== environment || !Number.isSafeInteger(data.id) || Number(data.id) <= 0 || typeof data.status !== "string" || !data.status) throw new InvalidPaymentSnapshot();
  const transaction = data.transaction && typeof data.transaction === "object" ? data.transaction as Record<string, unknown> : null;
  if (transaction?.domain !== undefined && transaction.domain !== environment) throw new InvalidPaymentSnapshot();
  const reference = typeof data.transaction_reference === "string" ? data.transaction_reference : typeof transaction?.reference === "string" ? transaction.reference : null;
  if (reference && !/^[a-zA-Z0-9_.=\-]{1,200}$/.test(reference)) throw new InvalidPaymentSnapshot();
  const amount = kind === "refund" ? data.amount : data.refund_amount;
  if (amount !== undefined && amount !== null && (!Number.isSafeInteger(amount) || Number(amount) < 0 || Number(amount) > 2147483647)) throw new InvalidPaymentSnapshot();
  const currency = typeof data.currency === "string" ? data.currency : null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new InvalidPaymentSnapshot();
  return db.transaction(async tx => {
    const id = String(data.id);
    const [prior] = await tx.select().from(s.paymentAdjustments).where(and(eq(s.paymentAdjustments.environment, environment), eq(s.paymentAdjustments.kind, kind), eq(s.paymentAdjustments.id, id))).for("update");
    if (prior && Date.parse(prior.observedAt) >= Date.parse(observedAt)) return prior.reference;
    let resolved = reference;
    if (!resolved && Number.isSafeInteger(data.transaction)) {
      const [order] = await tx.select({ reference: s.orders.reference }).from(s.orders).where(and(eq(s.orders.environment, environment), eq(s.orders.providerId, String(data.transaction))));
      resolved = order?.reference ?? null;
    }
    await tx.insert(s.paymentAdjustments).values({ environment, kind, id, reference: resolved, status: data.status as string, amountMinor: amount == null ? null : Number(amount), currency,
      observedAt, payload: data }).onConflictDoUpdate({ target: [s.paymentAdjustments.environment, s.paymentAdjustments.kind, s.paymentAdjustments.id],
      set: { reference: resolved, status: data.status as string, amountMinor: amount == null ? null : Number(amount), currency, observedAt, payload: data },
      setWhere: sql`${s.paymentAdjustments.observedAt} < ${observedAt}::timestamptz` });
    if (resolved && (kind === "dispute" || data.status !== "failed")) await tx.update(s.orders).set({ paymentReview: kind }).where(and(eq(s.orders.environment, environment), eq(s.orders.reference, resolved)));
    return resolved;
  });
}
