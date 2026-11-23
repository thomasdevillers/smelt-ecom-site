import { createHash, randomUUID } from "node:crypto";
import { and, eq, lte, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { parsePaystackEvent } from "../paystackEvent";
import * as s from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof s>;
export type PaymentMode = "live" | "test";
export type InboxEvent = typeof s.paystackEvents.$inferSelect;
export type EventOutcome = "done" | "ignored" | "manual_review";
const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function paystackInbox(db: Database, environment: PaymentMode, clock = () => new Date()) {
  const where = (id: string) => and(eq(s.paystackEvents.environment, environment), eq(s.paystackEvents.id, id));
  const owned = (event: InboxEvent) => and(where(event.id), eq(s.paystackEvents.state, "processing"), eq(s.paystackEvents.leaseToken, event.leaseToken!));
  async function namespace(tx: Database) {
    await tx.insert(s.environments).values({ id: environment, paymentMode: environment }).onConflictDoNothing();
    const [row] = await tx.select().from(s.environments).where(eq(s.environments.id, environment));
    if (row?.paymentMode !== environment) throw new Error("Payment namespace mismatch.");
  }
  return {
    async ingest(raw: string, origin: "webhook" | "verification" | "discovery" = "webhook") {
      const event = parsePaystackEvent(raw), id = digest(raw), now = clock().toISOString();
      if (event.data?.domain !== undefined && event.data.domain !== environment) throw new Error("Payment mode mismatch.");
      const reference = typeof event.data?.reference === "string" && /^[a-zA-Z0-9_.=\-]{1,200}$/.test(event.data.reference) ? event.data.reference : null;
      await db.transaction(async tx => {
        await namespace(tx);
        await tx.insert(s.paystackEvents).values({ environment, id, raw, reference, origin, eventType: event.event!, receivedAt: now, availableAt: now }).onConflictDoNothing();
      });
      return id;
    },
    async claim(): Promise<InboxEvent | null> {
      return db.transaction(async tx => {
        const now = clock(), timestamp = now.toISOString();
        const [event] = await tx.select().from(s.paystackEvents).where(and(eq(s.paystackEvents.environment, environment),
          or(and(eq(s.paystackEvents.state, "pending"), lte(s.paystackEvents.availableAt, timestamp)),
            and(eq(s.paystackEvents.state, "processing"), lte(s.paystackEvents.leaseUntil, timestamp)))))
          .orderBy(s.paystackEvents.availableAt, s.paystackEvents.id).limit(1).for("update", { skipLocked: true });
        if (!event) return null;
        const [claimed] = await tx.update(s.paystackEvents).set({ state: "processing", attempts: event.attempts + 1,
          leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + 300_000).toISOString() }).where(where(event.id)).returning();
        return claimed;
      });
    },
    async finish(event: InboxEvent, state: EventOutcome, reason: string | null = null) {
      const result = await db.update(s.paystackEvents).set({ state, reason, finishedAt: clock().toISOString(), leaseToken: null, leaseUntil: null })
        .where(owned(event)).returning({ id: s.paystackEvents.id });
      if (!result.length) throw new Error("Payment event lease lost.");
    },
    async retry(event: InboxEvent) {
      // Bound unattended retries. No provider error text/customer data is stored.
      if (event.attempts >= 10) {
        await this.finish(event, "manual_review", "verification-retries-exhausted");
        return "manual_review" as const;
      }
      const rows = await db.update(s.paystackEvents).set({ state: "pending", reason: "verification-unavailable", leaseToken: null, leaseUntil: null,
        availableAt: new Date(clock().getTime() + Math.min(60_000 * 2 ** (event.attempts - 1), 3_600_000)).toISOString() }).where(owned(event)).returning({ id: s.paystackEvents.id });
      if (!rows.length) throw new Error("Payment event lease lost.");
      return "pending" as const;
    },
    async beginEffects(event: InboxEvent, observedAt: string): Promise<"started" | "done" | "manual_review" | "stale"> {
      if (!event.reference) throw new Error("Payment reference required.");
      return db.transaction(async tx => {
        const [current] = await tx.select().from(s.paystackEvents).where(owned(event)).for("update");
        if (!current || !current.leaseUntil || Date.parse(current.leaseUntil) <= clock().getTime()) throw new Error("Payment event lease lost.");
        const [order] = await tx.select().from(s.orders).where(and(eq(s.orders.environment, environment), eq(s.orders.reference, event.reference!))).for("update");
        if (!order || order.paymentStatus !== "success" || order.paymentReview !== "clear" || Date.parse(order.observedAt ?? "") !== Date.parse(observedAt)) return "stale";
        const [imported] = await tx.select({ id: s.paymentSnapshots.id }).from(s.paymentSnapshots).where(and(eq(s.paymentSnapshots.environment, environment), eq(s.paymentSnapshots.orderReference, event.reference!), eq(s.paymentSnapshots.source, "backfill"))).limit(1);
        if (imported) return "manual_review";
        const inserted = await tx.insert(s.paystackEffects).values({ environment, reference: event.reference!, eventId: event.id,
          state: "started", startedAt: clock().toISOString() }).onConflictDoNothing().returning();
        if (inserted.length) return "started";
        const [prior] = await tx.select().from(s.paystackEffects).where(and(eq(s.paystackEffects.environment, environment), eq(s.paystackEffects.reference, event.reference!)));
        return prior?.state === "done" ? "done" : "manual_review";
      });
    },
    async finishEffects(event: InboxEvent, state: "done" | "manual_review") {
      const rows = await db.update(s.paystackEffects).set({ state, finishedAt: clock().toISOString() }).where(and(
        eq(s.paystackEffects.environment, environment), eq(s.paystackEffects.reference, event.reference!),
        eq(s.paystackEffects.eventId, event.id), eq(s.paystackEffects.state, "started"))).returning();
      if (!rows.length) throw new Error("Payment effect ownership lost.");
    },
    async counts() {
      const rows = await db.select({ state: s.paystackEvents.state, count: sql<number>`count(*)::integer` }).from(s.paystackEvents)
        .where(eq(s.paystackEvents.environment, environment)).groupBy(s.paystackEvents.state);
      return Object.fromEntries(rows.map(row => [row.state, row.count]));
    },
  };
}
