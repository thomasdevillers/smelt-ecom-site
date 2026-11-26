/** Checkpointed backfill only. Runtime reconciliation must use a separate writer. */
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "../../lib/db/schema";
import { sha256 } from "./baseline";
import { canonical } from "./review-custom-plan";
import { ImportConflict } from "./review-custom-write";
import type { Mode, OrderImport, OrderPlan, ShipmentImport } from "./order-plan";
import { orderProjection } from "../../lib/orderProjection";
import { storePaymentCustomer } from "../../lib/db/payment-observations";

type Database = PgDatabase<PgQueryResultHKT, typeof s>;
type Outcome = "inserted" | "checkpointed";
const condition = (environment: Mode, reference: string) =>
  and(eq(s.orders.environment, environment), eq(s.orders.reference, reference));
const hash = (value: unknown) => sha256(canonical(value));
const observationId = (order: OrderImport) =>
  hash({ snapshot: order.snapshot, observedAt: order.observedAt });
const orderValues = (order: OrderImport) => {
  const { items, ...values } = order;
  void items;
  return values;
};
function equal(expected: Record<string, unknown>, actual: Record<string, unknown> | undefined) {
  return (
    !!actual &&
    Object.entries(expected).every(([key, value]) => {
      const found = actual[key];
      if (key.endsWith("At") && typeof value === "string" && typeof found === "string")
        return Date.parse(value) === Date.parse(found);
      return canonical(value) === canonical(found);
    })
  );
}
async function ensureEnvironment(db: Database, environment: Mode) {
  await db
    .insert(s.environments)
    .values({ id: environment, paymentMode: environment })
    .onConflictDoNothing();
  const [row] = await db.select().from(s.environments).where(eq(s.environments.id, environment));
  if (row?.paymentMode !== environment) throw new ImportConflict();
}
async function checkpoint(
  db: Database,
  plan: OrderPlan,
  kind: string,
  key: string,
  value: unknown,
  write: (tx: Database) => Promise<void>,
): Promise<Outcome> {
  const id = `phase5:${plan.environment}:${kind}:${key}`,
    sourceHash = hash(value);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
    const [prior] = await tx.select().from(s.migrationImports).where(eq(s.migrationImports.id, id));
    if (prior) {
      if (prior.sourceHash !== sourceHash || prior.targetTable !== kind) throw new ImportConflict();
      // Never recreate a record removed after import, or overwrite a newer write.
      return "checkpointed";
    }
    await ensureEnvironment(tx, plan.environment);
    await write(tx);
    await tx.insert(s.migrationImports).values({
      id,
      sourceHash,
      archiveChecksum: plan.archiveChecksum,
      targetTable: kind,
      importedAt: new Date().toISOString(),
    });
    return "inserted";
  });
}
async function writeOrder(db: Database, plan: OrderPlan, order: OrderImport) {
  return checkpoint(db, plan, "orders", order.reference, order, async (tx) => {
    const environment = plan.environment;
    await tx
      .insert(s.orders)
      .values({ environment, reference: order.reference, paymentStatus: "unknown", snapshot: {} })
      .onConflictDoNothing();
    const [existing] = await tx
      .select()
      .from(s.orders)
      .where(condition(environment, order.reference))
      .for("update");
    // Phase 4 order stubs can be enriched, but real order data cannot be replaced.
    if (
      !existing ||
      existing.paymentStatus !== "unknown" ||
      existing.amountMinor !== null ||
      existing.currency !== null ||
      existing.customerId !== null ||
      existing.providerId !== null ||
      existing.observedAt !== null ||
      existing.paidAt !== null ||
      existing.createdAt !== null ||
      canonical(existing.snapshot) !== "{}" ||
      (existing.completedAt !== null &&
        Date.parse(existing.completedAt) !== Date.parse(order.completedAt ?? "")) ||
      (existing.reviewMessageSentAt !== null &&
        Date.parse(existing.reviewMessageSentAt) !== Date.parse(order.reviewMessageSentAt ?? ""))
    )
      throw new ImportConflict();
    const items = await tx
      .select()
      .from(s.orderItems)
      .where(
        and(eq(s.orderItems.environment, environment), eq(s.orderItems.reference, order.reference)),
      );
    if (items.length) throw new ImportConflict();
    const customerId = await storePaymentCustomer(
      tx,
      environment,
      order.snapshot,
      order.observedAt,
    );
    await tx
      .update(s.orders)
      .set({ ...orderValues(order), ...orderProjection(order.snapshot), customerId })
      .where(condition(environment, order.reference));
    if (order.items.length)
      await tx
        .insert(s.orderItems)
        .values(order.items.map((item) => ({ ...item, environment, reference: order.reference })));
    await tx.insert(s.paymentSnapshots).values({
      environment,
      id: observationId(order),
      orderReference: order.reference,
      observedAt: order.observedAt,
      source: "backfill",
      payload: order.snapshot,
    });
  });
}
async function writeShipment(db: Database, plan: OrderPlan, shipment: ShipmentImport) {
  return checkpoint(db, plan, "shipments", shipment.id, shipment, async (tx) => {
    const { sources, ...values } = shipment,
      environment = plan.environment;
    await tx.insert(s.shipments).values({ environment, ...values });
    if (sources.length)
      await tx
        .insert(s.shipmentSources)
        .values(sources.map((source) => ({ environment, shipmentId: shipment.id, ...source })));
  });
}
export async function applyOrderPlan(
  db: Database,
  plan: OrderPlan,
  report: (row: {
    id: string;
    table: string;
    outcome: Outcome | "failed";
  }) => Promise<void> = async () => {},
) {
  if (plan.rejected.length) throw new Error("Resolve quarantined records before import.");
  const counts = { inserted: 0, checkpointed: 0 };
  for (const [table, entries] of [
    ["orders", plan.orders],
    ["shipments", plan.shipments],
  ] as const) {
    for (const entry of entries) {
      const id = "reference" in entry ? entry.reference : entry.id;
      try {
        const outcome =
          table === "orders"
            ? await writeOrder(db, plan, entry as OrderImport)
            : await writeShipment(db, plan, entry as ShipmentImport);
        counts[outcome]++;
        await report({ id, table, outcome });
      } catch {
        await report({ id, table, outcome: "failed" });
        throw new ImportConflict();
      }
    }
  }
  return counts;
}

/** Read-only comparison; checkpoint success alone is not reconciliation. */
export async function verifyOrderPlan(db: Database, plan: OrderPlan) {
  if (plan.rejected.length) throw new Error("Resolve quarantined records before verification.");
  const mismatches: { table: string; id: string }[] = [];
  // A coherent database view matters if runtime writers have already started.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    const [namespace] = await tx
      .select()
      .from(s.environments)
      .where(eq(s.environments.id, plan.environment));
    if (namespace?.paymentMode !== plan.environment)
      mismatches.push({ table: "environments", id: plan.environment });
    for (const order of plan.orders) {
      const [row] = await tx
        .select()
        .from(s.orders)
        .where(condition(plan.environment, order.reference));
      const items = await tx
        .select()
        .from(s.orderItems)
        .where(
          and(
            eq(s.orderItems.environment, plan.environment),
            eq(s.orderItems.reference, order.reference),
          ),
        )
        .orderBy(s.orderItems.position);
      const [snapshot] = await tx
        .select()
        .from(s.paymentSnapshots)
        .where(
          and(
            eq(s.paymentSnapshots.environment, plan.environment),
            eq(s.paymentSnapshots.id, observationId(order)),
          ),
        );
      if (
        !equal({ ...orderValues(order), ...orderProjection(order.snapshot) }, row) ||
        items.length !== order.items.length ||
        items.some((item, i) => !equal(order.items[i], item)) ||
        !equal(
          {
            orderReference: order.reference,
            payload: order.snapshot,
            source: "backfill",
            observedAt: order.observedAt,
          },
          snapshot,
        )
      )
        mismatches.push({ table: "orders", id: order.reference });
    }
    for (const shipment of plan.shipments) {
      const { sources, ...values } = shipment;
      const [row] = await tx
        .select()
        .from(s.shipments)
        .where(and(eq(s.shipments.environment, plan.environment), eq(s.shipments.id, shipment.id)));
      const aliases = await tx
        .select({
          sourceKey: s.shipmentSources.sourceKey,
          sourceField: s.shipmentSources.sourceField,
        })
        .from(s.shipmentSources)
        .where(
          and(
            eq(s.shipmentSources.environment, plan.environment),
            eq(s.shipmentSources.shipmentId, shipment.id),
          ),
        );
      if (
        !equal(values, row) ||
        canonical(aliases.sort((a, b) => canonical(a).localeCompare(canonical(b)))) !==
          canonical(sources)
      )
        mismatches.push({ table: "shipments", id: shipment.id });
    }
    // Existing Phase 4 stubs are allowed; unexpected enriched orders/shipments are drift.
    const expectedOrders = new Set(plan.orders.map((order) => order.reference)),
      expectedShipments = new Set(plan.shipments.map((shipment) => shipment.id));
    for (const row of await tx
      .select()
      .from(s.orders)
      .where(eq(s.orders.environment, plan.environment))) {
      if (row.providerId !== null && !expectedOrders.has(row.reference))
        mismatches.push({ table: "unexpected-order", id: row.reference });
    }
    for (const row of await tx
      .select({ id: s.shipments.id })
      .from(s.shipments)
      .where(eq(s.shipments.environment, plan.environment))) {
      if (!expectedShipments.has(row.id))
        mismatches.push({ table: "unexpected-shipment", id: row.id });
    }
  });
  return {
    valid: !mismatches.length,
    plan: plan.digest,
    orders: plan.orders.length,
    shipments: plan.shipments.length,
    amountMinor: plan.orders.reduce<Record<string, number>>((totals, order) => {
      const key = `${order.currency}:${order.paymentStatus}`;
      totals[key] = (totals[key] ?? 0) + order.amountMinor;
      return totals;
    }, {}),
    mismatches,
  };
}

/** Explicit paused reconciliation against a retained baseline, never a blind
 * upsert. Each change requires both its old checkpoint and exact old contents.
 * Removed business records require a separate disposition, not implicit deletion. */
export async function reconcileOrderPlans(
  db: Database,
  before: OrderPlan,
  after: OrderPlan,
  report: (row: { table: string; id: string; outcome: string }) => Promise<void> = async () => {},
) {
  if (before.environment !== after.environment || before.rejected.length || after.rejected.length)
    throw new ImportConflict();
  const environment = after.environment;
  if (
    before.orders.some((old) => !after.orders.some((row) => row.reference === old.reference)) ||
    before.shipments.some((old) => !after.shipments.some((row) => row.id === old.id))
  )
    throw new Error(
      "Source removals need an explicit retention/disposition decision; no records changed.",
    );
  const counts = { reconciled: 0, inserted: 0, checkpointed: 0 };
  for (const order of after.orders) {
    const old = before.orders.find((row) => row.reference === order.reference);
    if (!old || hash(old) === hash(order)) {
      const outcome = await writeOrder(db, after, order);
      counts[outcome]++;
      await report({ table: "orders", id: order.reference, outcome });
      continue;
    }
    const outcome = await db.transaction(async (tx) => {
      const id = `phase5:${environment}:orders:${order.reference}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
      const [checkpoint] = await tx
        .select()
        .from(s.migrationImports)
        .where(eq(s.migrationImports.id, id));
      if (checkpoint?.sourceHash === hash(order)) return "checkpointed" as const;
      if (checkpoint?.sourceHash !== hash(old)) throw new ImportConflict();
      const [current] = await tx
        .select()
        .from(s.orders)
        .where(condition(environment, order.reference))
        .for("update");
      const items = await tx
        .select()
        .from(s.orderItems)
        .where(
          and(
            eq(s.orderItems.environment, environment),
            eq(s.orderItems.reference, order.reference),
          ),
        )
        .orderBy(s.orderItems.position);
      if (
        !equal({ ...orderValues(old), ...orderProjection(old.snapshot) }, current) ||
        items.length !== old.items.length ||
        items.some((item, i) => !equal(old.items[i], item))
      )
        throw new ImportConflict();
      const customerId = await storePaymentCustomer(
        tx,
        environment,
        order.snapshot,
        order.observedAt,
      );
      await tx
        .update(s.orders)
        .set({ ...orderValues(order), ...orderProjection(order.snapshot), customerId })
        .where(condition(environment, order.reference));
      await tx
        .delete(s.orderItems)
        .where(
          and(
            eq(s.orderItems.environment, environment),
            eq(s.orderItems.reference, order.reference),
          ),
        );
      if (order.items.length)
        await tx
          .insert(s.orderItems)
          .values(
            order.items.map((item) => ({ ...item, environment, reference: order.reference })),
          );
      await tx
        .insert(s.paymentSnapshots)
        .values({
          environment,
          id: observationId(order),
          orderReference: order.reference,
          observedAt: order.observedAt,
          source: "backfill",
          payload: order.snapshot,
        })
        .onConflictDoNothing();
      await tx
        .update(s.migrationImports)
        .set({
          sourceHash: hash(order),
          archiveChecksum: after.archiveChecksum,
          importedAt: new Date().toISOString(),
        })
        .where(eq(s.migrationImports.id, id));
      return "reconciled" as const;
    });
    counts[outcome]++;
    await report({ table: "orders", id: order.reference, outcome });
  }
  for (const shipment of after.shipments) {
    const old = before.shipments.find((row) => row.id === shipment.id);
    if (!old || hash(old) === hash(shipment)) {
      const outcome = await writeShipment(db, after, shipment);
      counts[outcome]++;
      await report({ table: "shipments", id: shipment.id, outcome });
      continue;
    }
    const outcome = await db.transaction(async (tx) => {
      const id = `phase5:${environment}:shipments:${shipment.id}`,
        identity = and(eq(s.shipments.environment, environment), eq(s.shipments.id, shipment.id));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
      const [checkpoint] = await tx
        .select()
        .from(s.migrationImports)
        .where(eq(s.migrationImports.id, id));
      if (checkpoint?.sourceHash === hash(shipment)) return "checkpointed" as const;
      if (
        checkpoint?.sourceHash !== hash(old) ||
        (old.status === "accepted" && shipment.status !== "accepted")
      )
        throw new ImportConflict();
      const [current] = await tx.select().from(s.shipments).where(identity).for("update");
      const { sources: oldSources, ...oldValues } = old;
      const aliases = await tx
        .select({
          sourceKey: s.shipmentSources.sourceKey,
          sourceField: s.shipmentSources.sourceField,
        })
        .from(s.shipmentSources)
        .where(
          and(
            eq(s.shipmentSources.environment, environment),
            eq(s.shipmentSources.shipmentId, shipment.id),
          ),
        );
      if (
        !equal(oldValues, current) ||
        canonical(aliases.sort((a, b) => canonical(a).localeCompare(canonical(b)))) !==
          canonical(oldSources)
      )
        throw new ImportConflict();
      const { sources, ...values } = shipment;
      await tx.update(s.shipments).set(values).where(identity);
      await tx
        .delete(s.shipmentSources)
        .where(
          and(
            eq(s.shipmentSources.environment, environment),
            eq(s.shipmentSources.shipmentId, shipment.id),
          ),
        );
      if (sources.length)
        await tx
          .insert(s.shipmentSources)
          .values(sources.map((source) => ({ environment, shipmentId: shipment.id, ...source })));
      await tx
        .update(s.migrationImports)
        .set({
          sourceHash: hash(shipment),
          archiveChecksum: after.archiveChecksum,
          importedAt: new Date().toISOString(),
        })
        .where(eq(s.migrationImports.id, id));
      return "reconciled" as const;
    });
    counts[outcome]++;
    await report({ table: "shipments", id: shipment.id, outcome });
  }
  return counts;
}
