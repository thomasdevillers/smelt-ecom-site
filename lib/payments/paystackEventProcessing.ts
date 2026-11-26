import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paystackInbox, type PaymentMode } from "../db/paystack-events";
import {
  InvalidPaymentSnapshot,
  paymentObservation,
  paymentObservationTime,
  savePaymentObservation,
} from "../db/payment-observations";
import type * as schema from "../db/schema";
import type { PaystackEvent } from "./paystackEvent";
import { paidCheckoutTotal, sanitizeCart } from "../checkout/checkoutShared";
import { parseVoucherMetadata } from "../vouchers";
import { savePaymentAdjustment } from "../db/payment-adjustments";

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface EventDependencies {
  db: Database;
  verify: (reference: string) => Promise<unknown>;
  handle: (event: PaystackEvent) => Promise<Response>;
  clock?: () => Date;
  observationTime?: () => Promise<string>;
  adjustment?: (kind: "refund" | "dispute", id: number) => Promise<unknown>;
}

/** Retries only the read/SQL stages automatically. Once external effects start,
 * an ambiguous outcome is held for review instead of silently repeating it. */
export async function processPaystackEvents(
  environment: PaymentMode,
  dependencies: EventDependencies,
  limit = 10,
) {
  const { db, verify, handle, clock = () => new Date() } = dependencies;
  const inbox = paystackInbox(db, environment, clock),
    started = clock().getTime();
  const result = { processed: 0, retried: 0, manualReview: 0 };
  for (
    let i = 0;
    i < Math.min(Math.max(limit, 0), 25) && clock().getTime() - started < 150_000;
    i++
  ) {
    const event = await inbox.claim();
    if (!event) break;
    const manual = async (reason: string) => {
      await inbox.finish(event, "manual_review", reason);
      result.manualReview++;
    };
    const retry = async () => {
      if ((await inbox.retry(event)) === "manual_review") result.manualReview++;
      else result.retried++;
    };
    if (event.eventType !== "charge.success" && event.eventType !== "charge.failed") {
      if (/^(refund|charge\.dispute)\./.test(event.eventType)) {
        const id = (JSON.parse(event.raw) as PaystackEvent).data?.id;
        if (!dependencies.adjustment || !Number.isSafeInteger(id) || Number(id) <= 0)
          await manual("refund-or-dispute-reconciliation-required");
        else {
          try {
            const kind = event.eventType.startsWith("refund.") ? "refund" : "dispute";
            const at = await (dependencies.observationTime?.() ?? paymentObservationTime(db));
            const reference = await savePaymentAdjustment(
              db,
              environment,
              kind,
              await dependencies.adjustment(kind, id!),
              at,
            );
            if (!reference) await manual("adjustment-order-unresolved");
            else {
              await inbox.finish(event, "done", "adjustment-reconciled");
              result.processed++;
            }
          } catch (error) {
            if (error instanceof InvalidPaymentSnapshot)
              await manual("invalid-provider-adjustment");
            else await retry();
          }
        }
      } else {
        await inbox.finish(event, "ignored", "unsupported-event-retained");
        result.processed++;
      }
      continue;
    }
    if (!event.reference) {
      await manual("missing-valid-reference");
      continue;
    }
    let observedAt: string;
    let verified: ReturnType<typeof paymentObservation>;
    try {
      observedAt = await (dependencies.observationTime?.() ?? paymentObservationTime(db));
      const raw = await verify(event.reference);
      verified = paymentObservation(raw, environment, event.reference, observedAt);
      if (!(await savePaymentObservation(db, environment, event.reference, raw, observedAt))) {
        await retry();
        continue;
      }
    } catch (error) {
      if (error instanceof InvalidPaymentSnapshot) await manual("invalid-provider-snapshot");
      else await retry();
      continue;
    }
    if (verified.paymentStatus === "pending") {
      await retry();
      continue;
    }
    if (event.eventType === "charge.failed") {
      if (verified.paymentStatus === "success") {
        await inbox.finish(event, "ignored", "superseded-failure");
        result.processed++;
      }
      // Legacy failure emails have no durable receipt/idempotency protocol.
      else await manual("failure-notification-requires-review");
      continue;
    }
    if (verified.paymentStatus !== "success") {
      await inbox.finish(event, "done", "payment-no-longer-successful");
      result.processed++;
      continue;
    }
    const original = JSON.parse(event.raw) as PaystackEvent,
      metadata = verified.metadata;
    const expectedAmount =
      paidCheckoutTotal(
        sanitizeCart(metadata.cart),
        metadata.shippingMethod,
        parseVoucherMetadata(metadata.voucher)?.amount ?? 0,
        metadata.unitPrice,
        metadata.pricingVersion,
      ) * 100;
    if (
      original.data?.id !== Number(verified.providerId) ||
      original.data?.amount !== verified.amountMinor ||
      original.data?.currency !== verified.currency ||
      verified.currency !== "ZAR" ||
      expectedAmount <= 0 ||
      verified.amountMinor !== expectedAmount
    ) {
      await manual("payment-identity-or-amount-mismatch");
      continue;
    }
    const age = clock().getTime() - Date.parse(verified.paidAt ?? "");
    if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) {
      await manual("historical-or-invalid-payment-date");
      continue;
    }
    const guard = await inbox.beginEffects(event, observedAt);
    if (guard === "stale") {
      await retry();
      continue;
    }
    if (guard === "manual_review") {
      await manual("prior-external-attempt-unconfirmed");
      continue;
    }
    if (guard === "started") {
      let accepted = false;
      try {
        // Use freshly verified details, never the delayed event's metadata.
        accepted = (
          await handle({
            event: "charge.success",
            data: { ...verified.snapshot, metadata } as PaystackEvent["data"],
          })
        ).ok;
      } catch {
        /* The durable started marker prevents blind replay after any ambiguous call. */
      }
      await inbox.finishEffects(event, accepted ? "done" : "manual_review");
      if (!accepted) {
        await manual("external-processing-unconfirmed");
        continue;
      }
    }
    await inbox.finish(event, "done");
    result.processed++;
  }
  return { ...result, states: await inbox.counts() };
}
