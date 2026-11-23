import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { AdminError } from "../admin/store";
import type { PaymentMode } from "./paystack-events";
import * as s from "./schema";
type Database = PgDatabase<PgQueryResultHKT, typeof s>;

export function paymentOperations(db: Database, environment: PaymentMode) {
  return {
    async list(page = 1, state = "manual_review") {
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !["pending", "processing", "manual_review", "done", "ignored"].includes(state)) throw new AdminError("Invalid payment event filter.");
      const filter = and(eq(s.paystackEvents.environment, environment), eq(s.paystackEvents.state, state));
      const [totals] = await db.select({ total: sql<number>`count(*)::integer` }).from(s.paystackEvents).where(filter);
      const events = await db.select({ id: s.paystackEvents.id, reference: s.paystackEvents.reference, eventType: s.paystackEvents.eventType, origin: s.paystackEvents.origin,
        state: s.paystackEvents.state, receivedAt: s.paystackEvents.receivedAt, attempts: s.paystackEvents.attempts, availableAt: s.paystackEvents.availableAt,
        reason: s.paystackEvents.reason, resolution: s.paystackEvents.resolution }).from(s.paystackEvents).where(filter)
        .orderBy(desc(s.paystackEvents.receivedAt), asc(s.paystackEvents.id)).limit(50).offset((page - 1) * 50);
      const sync = await db.select({ stream: s.providerSync.stream, page: s.providerSync.page, windowEnd: s.providerSync.windowEnd, completedAt: s.providerSync.completedAt }).from(s.providerSync).where(eq(s.providerSync.environment, environment));
      return { events, total: totals.total, page, pageCount: Math.ceil(totals.total / 50), sync };
    },
    async resolve(id: string, action: "acknowledge" | "retry-verification", evidence: string) {
      if (!/^[a-f0-9]{64}$/.test(id) || !["acknowledge", "retry-verification"].includes(action) || evidence.trim().length < 12 || evidence.length > 2000) throw new AdminError("An event, resolution and reconciliation evidence are required.");
      return db.transaction(async tx => {
        const identity = and(eq(s.paystackEvents.environment, environment), eq(s.paystackEvents.id, id));
        const [event] = await tx.select().from(s.paystackEvents).where(identity).for("update");
        if (!event || event.state !== "manual_review") throw new AdminError("Only held events can be resolved.", 409);
        if (action === "retry-verification" && event.reference) {
          const [effect] = await tx.select().from(s.paystackEffects).where(and(eq(s.paystackEffects.environment, environment), eq(s.paystackEffects.reference, event.reference)));
          if (effect) throw new AdminError("An external attempt exists. Reconcile it without replaying the payment.", 409);
        }
        const now = new Date().toISOString(), history = Array.isArray(event.resolution?.history) ? event.resolution.history : [];
        await tx.update(s.paystackEvents).set({ state: action === "acknowledge" ? "done" : "pending", availableAt: now,
          finishedAt: action === "acknowledge" ? now : null, attempts: action === "retry-verification" ? 0 : event.attempts, reason: "operator-reconciled",
          resolution: { history: [...history, { action, evidence: evidence.trim(), at: now, priorAttempts: event.attempts, priorReason: event.reason }] } }).where(identity);
        // No mutation of effect guards, receipt deadlines, provider state or balances.
        return { resolved: true, action };
      });
    },
  };
}
