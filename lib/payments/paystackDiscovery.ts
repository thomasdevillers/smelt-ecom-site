import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../db/schema";
import { paystackInbox, type PaymentMode } from "../db/paystack-events";
import {
  InvalidPaymentSnapshot,
  paymentObservationTime,
  savePaymentObservation,
} from "../db/payment-observations";
import { savePaymentAdjustment } from "../db/payment-adjustments";

type Database = PgDatabase<PgQueryResultHKT, typeof s>;
type Stream = "transaction" | "refund" | "dispute";
interface ProviderPage {
  data: unknown[];
  meta: { total: number; pageCount: number; page?: number };
}

/** Checkpointed full-history sweeps with a fixed upper creation date per sweep.
 * Repeats complete sweeps so old refunds/disputes changing status are revisited.
 * Each page and its cursor commit together; external actions are never invoked. */
export async function discoverPaystack(
  db: Database,
  environment: PaymentMode,
  read: (path: string) => Promise<ProviderPage>,
  pagesPerStream = 1,
) {
  const result = { pages: 0, transactions: 0, adjustments: 0, quarantined: 0 };
  for (const stream of ["refund", "dispute", "transaction"] as Stream[]) {
    const identity = and(
      eq(s.providerSync.environment, environment),
      eq(s.providerSync.stream, stream),
    );
    const lease = await db.transaction(async (tx) => {
      const now = await paymentObservationTime(tx);
      await tx
        .insert(s.environments)
        .values({ id: environment, paymentMode: environment })
        .onConflictDoNothing();
      const [namespace] = await tx
        .select()
        .from(s.environments)
        .where(eq(s.environments.id, environment));
      if (namespace.paymentMode !== environment) throw new Error("Provider namespace mismatch.");
      await tx
        .insert(s.providerSync)
        .values({ environment, stream, windowEnd: now })
        .onConflictDoNothing();
      const [cursor] = await tx.select().from(s.providerSync).where(identity).for("update");
      if (cursor.leaseUntil && Date.parse(cursor.leaseUntil) > Date.parse(now)) return null;
      const leaseToken = randomUUID(),
        windowEnd = cursor.completedAt ? now : cursor.windowEnd;
      await tx
        .update(s.providerSync)
        .set({
          leaseToken,
          leaseUntil: new Date(Date.parse(now) + 300_000).toISOString(),
          windowEnd,
          page: cursor.completedAt ? 1 : cursor.page,
          completedAt: null,
        })
        .where(identity);
      return { token: leaseToken, page: cursor.completedAt ? 1 : cursor.page, windowEnd };
    });
    if (!lease) continue;
    try {
      for (let n = 0; n < Math.min(pagesPerStream, 3); n++) {
        const observedAt = await paymentObservationTime(db);
        const query = new URLSearchParams({
          page: String(lease.page),
          perPage: "100",
          to: new Date(lease.windowEnd).toISOString(),
        });
        const body = await read(`/${stream}?${query}`);
        if (
          !Array.isArray(body.data) ||
          !Number.isSafeInteger(body.meta?.total) ||
          body.meta.total < 0 ||
          !Number.isSafeInteger(body.meta?.pageCount) ||
          body.meta.pageCount < 0 ||
          (body.meta.page !== undefined && body.meta.page !== lease.page) ||
          (!body.data.length && lease.page < body.meta.pageCount)
        )
          throw new Error("Invalid provider pagination.");
        const done = lease.page >= body.meta.pageCount;
        await db.transaction(async (tx) => {
          const [cursor] = await tx.select().from(s.providerSync).where(identity).for("update");
          const now = await paymentObservationTime(tx);
          if (
            cursor.leaseToken !== lease.token ||
            !cursor.leaseUntil ||
            Date.parse(cursor.leaseUntil) <= Date.parse(now)
          )
            throw new Error("Discovery lease lost.");
          for (const raw of body.data) {
            try {
              if (stream === "transaction") {
                const data = raw as Record<string, unknown>;
                if (!data || typeof data.reference !== "string") throw new InvalidPaymentSnapshot();
                await savePaymentObservation(tx, environment, data.reference, data, observedAt);
                const age = Date.parse(observedAt) - Date.parse(String(data.paid_at ?? ""));
                if (data.status === "success" && age >= 0 && age < 86_400_000)
                  await paystackInbox(tx, environment).ingest(
                    JSON.stringify({ event: "charge.success", data }),
                    "discovery",
                  );
                result.transactions++;
              } else {
                await savePaymentAdjustment(tx, environment, stream, raw, observedAt);
                result.adjustments++;
              }
            } catch (error) {
              if (!(error instanceof InvalidPaymentSnapshot)) throw error;
              const rawEvent = JSON.stringify({
                event: "provider.invalid",
                data: { stream, record: raw },
              });
              const id = await paystackInbox(tx, environment).ingest(rawEvent, "discovery");
              await tx
                .update(s.paystackEvents)
                .set({ state: "manual_review", reason: "invalid-provider-discovery-record" })
                .where(
                  and(eq(s.paystackEvents.environment, environment), eq(s.paystackEvents.id, id)),
                );
              result.quarantined++;
            }
          }
          await tx
            .update(s.providerSync)
            .set({ page: done ? 1 : lease.page + 1, completedAt: done ? now : null })
            .where(identity);
        });
        result.pages++;
        lease.page++;
        if (done) break;
      }
    } finally {
      await db
        .update(s.providerSync)
        .set({ leaseToken: null, leaseUntil: null })
        .where(and(identity, eq(s.providerSync.leaseToken, lease.token)));
    }
  }
  return result;
}
