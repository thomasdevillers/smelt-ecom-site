import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { paystackEventConfig, paystackEnvironment } from "./paystackEventConfig";
import { paystackInbox, type PaymentMode } from "../db/paystack-events";
import { paymentObservationTime, savePaymentObservation } from "../db/payment-observations";
import { processPaystackEvents } from "./paystackEventProcessing";
import { handleLegacyPaystackEvent } from "./paystackLegacyEvent";
import { orders } from "../db/schema";
import { ordersPaused } from "../orderPersistence";
import { readPaystack } from "./paystackProvider";
import { discoverPaystack } from "./paystackDiscovery";

async function database() {
  const { postgresStore } = await import("../db/client");
  return postgresStore().db;
}
async function verify(reference: string) {
  const key = process.env.PAYSTACK_SECRET_KEY!;
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error("Paystack verification unavailable.");
  const body = await response.json();
  if (body.status !== true) throw new Error("Paystack verification unavailable.");
  return body.data;
}
export async function persistPaystackEvent(environment: PaymentMode, raw: string) {
  if (paystackEventConfig().store !== "postgres" || paystackEnvironment() !== environment)
    throw new Error("Paystack ingestion is not configured.");
  return paystackInbox(await database(), environment).ingest(raw);
}
export async function persistVerifiedPayment(data: Record<string, unknown>) {
  if (paystackEventConfig().store !== "postgres")
    throw new Error("Durable payment ingestion is not configured.");
  const environment = paystackEnvironment();
  if (
    data.domain !== environment ||
    data.status !== "success" ||
    typeof data.reference !== "string"
  )
    throw new Error("Invalid verified payment.");
  return paystackInbox(await database(), environment).ingest(
    JSON.stringify({ event: "charge.success", data }),
    "verification",
  );
}
export async function runPaystackEvents() {
  const config = paystackEventConfig();
  if (config.store !== "postgres" || config.paused || ordersPaused())
    return { skipped: true, paused: config.paused || ordersPaused() };
  return processPaystackEvents(paystackEnvironment(), {
    db: await database(),
    verify,
    handle: handleLegacyPaystackEvent,
    adjustment: async (kind, id) => (await readPaystack(`/${kind}/${id}`)).data,
  });
}
export async function discoverPaystackOrders() {
  const config = paystackEventConfig();
  if (config.store !== "postgres" || config.paused || ordersPaused()) return { skipped: true };
  return discoverPaystack(await database(), paystackEnvironment(), readPaystack);
}

/** Side-effect-free known-reference sweep. Includes Phase 4 stubs so a missed
 * event can still be recovered. Unknown references need provider discovery. */
export async function reconcileKnownPaystackOrders() {
  const config = paystackEventConfig();
  if (config.store !== "postgres" || config.paused || ordersPaused())
    return { skipped: true, paused: config.paused || ordersPaused() };
  const environment = paystackEnvironment(),
    db = await database();
  const started = Date.now();
  const rows = await db
    .select({ reference: orders.reference })
    .from(orders)
    .where(
      and(
        eq(orders.environment, environment),
        or(
          isNull(orders.reconcileAfter),
          lte(orders.reconcileAfter, new Date(started).toISOString()),
        ),
      ),
    )
    .orderBy(sql`${orders.reconcileAfter} asc nulls first`, asc(orders.reference))
    .limit(25);
  const result = { checked: 0, updated: 0, failed: 0 };
  for (const { reference } of rows) {
    if (Date.now() - started >= 150_000) break;
    try {
      const observedAt = await paymentObservationTime(db);
      if (
        await savePaymentObservation(
          db,
          environment,
          reference,
          await verify(reference),
          observedAt,
        )
      )
        result.updated++;
    } catch {
      result.failed++;
    }
    // Rotate failures too, without inventing a newer payment observation.
    await db
      .update(orders)
      .set({ reconcileAfter: new Date(Date.now() + 3_600_000).toISOString() })
      .where(and(eq(orders.environment, environment), eq(orders.reference, reference)));
    result.checked++;
  }
  return result;
}
