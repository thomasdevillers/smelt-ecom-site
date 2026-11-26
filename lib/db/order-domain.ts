import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { AdminError } from "../admin/store";
import type { ShippingReceipt } from "../admin/types";
import type { PaymentMode } from "./paystack-events";
import * as s from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof s>;
export type PendingShipment = ShippingReceipt & {
  message?: { from: string; to: string; subject: string; html: string; text: string };
};
export type AllocationOverrides = Record<string, { green: number; cream: number }>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const orderAlias = (reference: string) => `smelt:shipping:order:v1:${hash(reference)}`;
const pairId = (receipt: ShippingReceipt) =>
  hash(`${receipt.email.toLowerCase()}\n${receipt.trackingNumber}`);
const count = (predicate: SQL) => sql<number>`count(*) filter (where ${predicate})::integer`;

export function orderDomain(db: Database, environment: PaymentMode) {
  const identity = (reference: string) =>
    and(eq(s.orders.environment, environment), eq(s.orders.reference, reference));
  const shipmentIdentity = (id: string) =>
    and(eq(s.shipments.environment, environment), eq(s.shipments.id, id));
  async function shippingLock(tx: Database) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`shipping:${environment}`}, 0))`,
    );
    await tx
      .insert(s.environments)
      .values({ id: environment, paymentMode: environment })
      .onConflictDoNothing();
    const [scope] = await tx
      .select()
      .from(s.environments)
      .where(eq(s.environments.id, environment));
    if (scope.paymentMode !== environment)
      throw new AdminError("Shipping namespace mismatch.", 503);
  }
  async function receiptForOrder(tx: Database, reference: string) {
    const [row] = await tx
      .select({ payload: s.shipments.payload })
      .from(s.shipments)
      .where(
        and(
          eq(s.shipments.environment, environment),
          or(
            eq(s.shipments.orderReference, reference),
            sql`exists (select 1 from ${s.shipmentSources} where ${s.shipmentSources.environment} = ${environment}
        and ${s.shipmentSources.shipmentId} = ${s.shipments.id} and ${s.shipmentSources.sourceKey} = ${orderAlias(reference)} and ${s.shipmentSources.sourceField} = '')`,
          ),
        ),
      );
    return row?.payload as unknown as PendingShipment | undefined;
  }
  async function alias(tx: Database, id: string, sourceKey: string, sourceField = "") {
    const [prior] = await tx
      .select()
      .from(s.shipmentSources)
      .where(
        and(
          eq(s.shipmentSources.environment, environment),
          eq(s.shipmentSources.sourceKey, sourceKey),
          eq(s.shipmentSources.sourceField, sourceField),
        ),
      );
    if (prior && prior.shipmentId !== id) throw new AdminError("Shipping identity conflict.", 409);
    await tx
      .insert(s.shipmentSources)
      .values({ environment, shipmentId: id, sourceKey, sourceField })
      .onConflictDoNothing();
  }
  return {
    async find(reference: string) {
      return (await db.select().from(s.orders).where(identity(reference)))[0] ?? null;
    },
    async completedDates(reference?: string) {
      const rows = await db
        .select({ reference: s.orders.reference, at: s.orders.completedAt })
        .from(s.orders)
        .where(
          and(
            eq(s.orders.environment, environment),
            isNotNull(s.orders.completedAt),
            reference ? eq(s.orders.reference, reference) : undefined,
          ),
        );
      return Object.fromEntries(
        rows.map((row) => [row.reference, new Date(row.at!).toISOString()]),
      );
    },
    async complete(reference: string, completed: boolean) {
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(s.orders).where(identity(reference)).for("update");
        if (!order || order.paymentStatus !== "success" || order.paymentReview !== "clear")
          throw new AdminError("Payment needs review.", 409);
        if (completed && (await receiptForOrder(tx, reference))?.status !== "accepted")
          throw new AdminError(
            "Send the shipping email for this order before marking it complete.",
            409,
          );
        const at = completed ? (order.completedAt ?? new Date().toISOString()) : null;
        await tx.update(s.orders).set({ completedAt: at }).where(identity(reference));
        return at ? new Date(at).toISOString() : null;
      });
    },
    async reviewMessage(reference: string) {
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(s.orders).where(identity(reference)).for("update");
        if (!order?.completedAt)
          throw new AdminError("Mark this order complete before recording a review message.", 409);
        const at = order.reviewMessageSentAt ?? new Date().toISOString();
        await tx.update(s.orders).set({ reviewMessageSentAt: at }).where(identity(reference));
        return new Date(at).toISOString();
      });
    },
    async byEmail(email: string) {
      return db
        .select()
        .from(s.orders)
        .where(
          and(
            eq(s.orders.environment, environment),
            eq(s.orders.customerEmail, email),
            eq(s.orders.paymentStatus, "success"),
          ),
        )
        .orderBy(desc(s.orders.paidAt), asc(s.orders.reference));
    },
    async allPaid() {
      return db
        .select()
        .from(s.orders)
        .where(and(eq(s.orders.environment, environment), eq(s.orders.paymentStatus, "success")))
        .orderBy(asc(s.orders.paidAt), asc(s.orders.reference));
    },
    async page(
      page: number,
      search: string,
      view: "active" | "completed" | "preorders",
      sort: "newest" | "oldest",
      allocations: AllocationOverrides,
    ) {
      const originalGreen = sql<number>`coalesce((${s.orders.preorder}->'quantities'->>'green')::integer, 0)`;
      const originalCream = sql<number>`coalesce((${s.orders.preorder}->'quantities'->>'cream')::integer, 0)`;
      const allocation = sql`(${JSON.stringify(allocations)}::jsonb -> ${s.orders.reference})`;
      const validOverride = sql`${s.orders.reference} like 'smeltp-%' and ${s.orders.preorder}->>'batch' in ('2026-10-22','2026-11-30')
        and ${allocation} is not null and (${allocation}->>'green')::integer <= ${originalGreen} and (${allocation}->>'cream')::integer <= ${originalCream}`;
      const green = sql<number>`case when ${validOverride} then (${allocation}->>'green')::integer else ${originalGreen} end`;
      const cream = sql<number>`case when ${validOverride} then (${allocation}->>'cream')::integer else ${originalCream} end`;
      const active = isNull(s.orders.completedAt),
        completed = isNotNull(s.orders.completedAt);
      const preorder = sql`${green} + ${cream} > 0`;
      const term = search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&");
      const base = and(
        eq(s.orders.environment, environment),
        eq(s.orders.paymentStatus, "success"),
        term ? ilike(s.orders.searchText, `%${term}%`) : undefined,
      )!;
      const filter = and(
        base,
        view === "completed" ? completed : active,
        view === "preorders" ? preorder : undefined,
      )!;
      return db.transaction(async (tx) => {
        await tx.execute(sql`set transaction isolation level repeatable read read only`);
        const [totals] = await tx
          .select({
            activeTotal: count(active),
            completedTotal: count(completed),
            total: count(
              view === "completed"
                ? completed
                : view === "preorders"
                  ? and(active, preorder)!
                  : active,
            ),
            green: sql<number>`coalesce(sum(${green}) filter (where ${active}), 0)::integer`,
            cream: sql<number>`coalesce(sum(${cream}) filter (where ${active}), 0)::integer`,
          })
          .from(s.orders)
          .where(base);
        const pageCount = Math.ceil(totals.total / 25),
          currentPage = Math.max(1, Math.min(page, Math.max(1, pageCount)));
        const rows = await tx
          .select({ ...getTableColumns(s.orders), effectiveGreen: green, effectiveCream: cream })
          .from(s.orders)
          .where(filter)
          .orderBy(
            view === "completed"
              ? sort === "oldest"
                ? asc(s.orders.completedAt)
                : desc(s.orders.completedAt)
              : view === "preorders"
                ? asc(s.orders.paidAt)
                : desc(s.orders.paidAt),
            asc(s.orders.reference),
          )
          .limit(25)
          .offset((currentPage - 1) * 25);
        return {
          rows,
          total: totals.total,
          activeTotal: totals.activeTotal,
          completedTotal: totals.completedTotal,
          preorderToFulfil: { green: totals.green, cream: totals.cream },
          page: currentPage,
          pageCount,
        };
      });
    },
    async shipment(reference: string) {
      return (await receiptForOrder(db, reference)) ?? null;
    },
    async history(email: string) {
      return (
        await db
          .select({ payload: s.shipments.payload })
          .from(s.shipments)
          .where(
            and(
              eq(s.shipments.environment, environment),
              eq(s.shipments.email, email.toLowerCase()),
              eq(s.shipments.status, "accepted"),
            ),
          )
          .orderBy(desc(s.shipments.startedAt))
      ).map((row) => row.payload as unknown as PendingShipment);
    },
    async reserve(proposed: PendingShipment) {
      return db.transaction(async (tx) => {
        await shippingLock(tx);
        if (proposed.reference) {
          const existing = await receiptForOrder(tx, proposed.reference);
          if (existing) return existing;
          const [order] = await tx.select().from(s.orders).where(identity(proposed.reference));
          if (!order || order.paymentStatus !== "success" || order.paymentReview !== "clear")
            throw new AdminError("Payment needs review.", 409);
        }
        const id = pairId(proposed),
          [existing] = await tx.select().from(s.shipments).where(shipmentIdentity(id));
        if (!existing)
          await tx.insert(s.shipments).values({
            environment,
            id,
            orderReference: proposed.reference ?? null,
            email: proposed.email.toLowerCase(),
            trackingNumber: proposed.trackingNumber,
            status: proposed.status,
            startedAt: new Date(proposed.startedAt).toISOString(),
            payload: proposed as unknown as Record<string, unknown>,
          });
        const receipt = existing ? (existing.payload as unknown as PendingShipment) : proposed;
        await alias(tx, id, `smelt:shipping:receipt:v1:${id}`);
        if (proposed.reference && (!existing || receipt.status === "accepted"))
          await alias(tx, id, orderAlias(proposed.reference));
        return receipt;
      });
    },
    async accept(receipt: ShippingReceipt) {
      return db.transaction(async (tx) => {
        await shippingLock(tx);
        const id = pairId(receipt),
          [existing] = await tx.select().from(s.shipments).where(shipmentIdentity(id));
        if (
          !existing ||
          receipt.status !== "accepted" ||
          !receipt.id ||
          (existing.status === "accepted" && existing.payload.id !== receipt.id)
        )
          throw new AdminError("Shipping acceptance needs review.", 409);
        if (
          existing.payload.reference !== receipt.reference ||
          existing.payload.startedAt !== receipt.startedAt
        )
          throw new AdminError("Shipping receipt changed.", 409);
        await tx
          .update(s.shipments)
          .set({
            status: "accepted",
            payload: {
              ...receipt,
              ...(existing.payload.localEvidence
                ? { localEvidence: existing.payload.localEvidence }
                : {}),
            },
          })
          .where(shipmentIdentity(id));
        await alias(tx, id, `smelt:shipping:history:v1:${hash(receipt.email.toLowerCase())}`, id);
      });
    },
    async importShipping(receipt: ShippingReceipt) {
      return db.transaction(async (tx) => {
        await shippingLock(tx);
        const id = pairId(receipt),
          [existing] = await tx.select().from(s.shipments).where(shipmentIdentity(id));
        if (existing) {
          const [same] = await tx
            .select()
            .from(s.shipments)
            .where(
              and(
                shipmentIdentity(id),
                sql`${s.shipments.payload} = ${JSON.stringify(receipt)}::jsonb`,
              ),
            );
          if (!same)
            throw new AdminError("Shared shipping receipt conflicts with local evidence.", 409);
        } else
          await tx.insert(s.shipments).values({
            environment,
            id,
            orderReference: receipt.reference ?? null,
            email: receipt.email.toLowerCase(),
            trackingNumber: receipt.trackingNumber,
            status: receipt.status,
            startedAt: new Date(receipt.startedAt).toISOString(),
            payload: receipt as unknown as Record<string, unknown>,
          });
        await alias(tx, id, `smelt:shipping:receipt:v1:${id}`);
        await alias(tx, id, `smelt:shipping:history:v1:${hash(receipt.email.toLowerCase())}`, id);
        if (receipt.reference) await alias(tx, id, orderAlias(receipt.reference));
      });
    },
  };
}
