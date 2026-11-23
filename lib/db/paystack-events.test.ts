import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "./schema";
import { paystackInbox } from "./paystack-events";
import { paymentObservation, savePaymentObservation } from "./payment-observations";
import { processPaystackEvents } from "../paystackEventProcessing";

const base = Date.parse("2026-11-21T12:00:00Z");
let now = base;
const clock = () => new Date(now), advance = (ms = 1_000) => { now += ms; };
const provider = (status = "success") => ({ id: 123, domain: "test", reference: "synthetic-order", status,
  amount: 54000, currency: "ZAR", created_at: new Date(base - 7_200_000).toISOString(), paid_at: new Date(base - 3_600_000).toISOString(),
  customer: { id: 99, email: "synthetic@example.invalid" },
  metadata: { cart: { green: 1, cream: 0 }, unitPrice: 450, shippingMethod: "aramex", customerName: "Original" } });
const delivery = (type = "charge.success", data: unknown = provider()) => JSON.stringify({ event: type, data });

describe("durable Paystack inbox and processing (isolated PostgreSQL)", () => {
  const pg = new PGlite({ extensions: { pg_trgm } }), db = drizzle(pg, { schema: s });
  const inbox = paystackInbox(db, "test", clock);
  const verify = vi.fn(), handle = vi.fn();
  const run = (limit = 10) => processPaystackEvents("test", { db, verify, handle, clock, observationTime: async () => clock().toISOString() }, limit);
  beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); }, 30_000);
  beforeEach(async () => {
    await pg.exec("truncate environments cascade");
    now = base; verify.mockReset().mockResolvedValue(provider()); handle.mockReset().mockResolvedValue(new Response("ok"));
  });
  afterAll(async () => { await pg.close(); });

  it("deduplicates exact raw deliveries durably without resetting attempts or deadlines", async () => {
    const raw = delivery(), id = await inbox.ingest(raw), event = (await inbox.claim())!;
    await inbox.retry(event); advance();
    expect(await inbox.ingest(raw)).toBe(id);
    const [row] = await db.select().from(s.paystackEvents);
    expect(row.raw).toBe(raw); expect(row.attempts).toBe(1);
    expect(Date.parse(row.availableAt)).toBe(base + 60_000);
    expect(await inbox.claim()).toBeNull();
  });
  it("validates environment ownership and isolates identical deliveries by namespace", async () => {
    await expect(paystackInbox(db, "live", clock).ingest(delivery())).rejects.toThrow();
    const raw = delivery("subscription.create", { id: 123 });
    await inbox.ingest(raw); await paystackInbox(db, "live", clock).ingest(raw);
    expect(await db.select().from(s.paystackEvents)).toHaveLength(2);
    expect((await inbox.claim())?.environment).toBe("test");
  });
  it("claims distinct jobs and fences a worker after lease expiry", async () => {
    await inbox.ingest(delivery());
    const first = (await inbox.claim())!;
    expect(await inbox.claim()).toBeNull();
    advance(300_001);
    const second = (await inbox.claim())!;
    expect(second.id).toBe(first.id); expect(second.leaseToken).not.toBe(first.leaseToken);
    await expect(inbox.finish(first, "done")).rejects.toThrow("lease lost");
    await expect(inbox.beginEffects(first, clock().toISOString())).rejects.toThrow("lease lost");
    await inbox.finish(second, "ignored");
  });
  it("verifies current payment data and commits the snapshot before external effects", async () => {
    await inbox.ingest(delivery());
    verify.mockResolvedValue({ ...provider(), metadata: { ...provider().metadata, customerName: "Fresh provider name" } });
    handle.mockImplementation(async event => {
      expect((await db.select().from(s.orders))[0].paymentStatus).toBe("success");
      expect((await db.select().from(s.paystackEffects))[0].state).toBe("started");
      expect(event.data.metadata.customerName).toBe("Fresh provider name");
      return new Response("ok");
    });
    expect((await run()).processed).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect((await db.select().from(s.paystackEvents))[0].state).toBe("done");
    expect((await db.select().from(s.paystackEffects))[0].state).toBe("done");
  });
  it("does not repeat effects for different signed payloads for the same reference", async () => {
    await inbox.ingest(delivery()); await run(); advance();
    await inbox.ingest(delivery("charge.success", { ...provider(), additionalProviderField: true }));
    expect((await run()).processed).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(await db.select().from(s.paystackEffects)).toHaveLength(1);
  });
  it("does not run effects for a delayed success when verification reports reversal", async () => {
    await inbox.ingest(delivery()); verify.mockResolvedValue(provider("reversed"));
    expect((await run()).processed).toBe(1);
    expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.orders))[0].paymentStatus).toBe("reversed");
  });
  it("suppresses a delayed failure after successful payment", async () => {
    await inbox.ingest(delivery("charge.failed", provider("failed")));
    expect((await run()).processed).toBe(1);
    expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.paystackEvents))[0].reason).toBe("superseded-failure");
  });
  it("holds failure emails and refund/dispute events for review rather than blindly sending/reversing", async () => {
    await inbox.ingest(delivery("charge.failed", provider("failed")));
    await inbox.ingest(delivery("refund.processed", { transaction: { reference: "synthetic-order" } }));
    await inbox.ingest(delivery("charge.dispute.create"));
    verify.mockResolvedValue(provider("failed"));
    expect((await run()).manualReview).toBe(3);
    expect(handle).not.toHaveBeenCalled();
  });
  it("retains unsupported events without scheduling effects", async () => {
    await inbox.ingest(delivery("subscription.create", { id: 123 }));
    expect((await run()).processed).toBe(1);
    expect(verify).not.toHaveBeenCalled(); expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.paystackEvents))[0].raw).toContain("subscription.create");
  });
  it("retries verification failures with durable backoff, without extending external-send windows", async () => {
    await inbox.ingest(delivery()); verify.mockRejectedValueOnce(new Error("private provider error"));
    expect((await run()).retried).toBe(1);
    expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.paystackEvents))[0].reason).toBe("verification-unavailable");
    advance(60_001); expect((await run()).processed).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("caps unattended verification retries", async () => {
    await inbox.ingest(delivery());
    await db.update(s.paystackEvents).set({ attempts: 9 });
    verify.mockRejectedValue(new Error("offline"));
    await run();
    expect((await db.select().from(s.paystackEvents))[0]).toMatchObject({ state: "manual_review", reason: "verification-retries-exhausted" });
  });
  it("waits for a success webhook whose verification still reports pending", async () => {
    await inbox.ingest(delivery()); verify.mockResolvedValue(provider("pending"));
    expect((await run()).retried).toBe(1); expect(handle).not.toHaveBeenCalled();
  });
  it("quarantines mismatched identity, mode, amount and invalid metadata", async () => {
    const cases = [{ ...provider(), reference: "wrong" }, { ...provider(), domain: "live" }, { ...provider(), amount: 1.5 },
      { ...provider(), metadata: { items: "broken" } }, { ...provider(), id: 999 }, { ...provider(), amount: 90000 }];
    for (const data of cases) {
      await pg.exec("truncate environments cascade");
      await inbox.ingest(delivery()); verify.mockResolvedValue(data);
      expect((await run()).manualReview).toBe(1);
    }
    expect(handle).not.toHaveBeenCalled();
  });
  it("does not generate historical new-order emails or financial actions", async () => {
    const historical = { ...provider(), paid_at: "2020-01-01T00:00:00Z" };
    await inbox.ingest(delivery("charge.success", historical)); verify.mockResolvedValue(historical);
    expect((await run()).manualReview).toBe(1);
    expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.orders))[0].amountMinor).toBe(54000);
  });
  it("holds ambiguous provider acceptance followed by legacy receipt persistence failure", async () => {
    await inbox.ingest(delivery());
    handle.mockRejectedValue(new Error("accepted by provider, Redis receipt write failed"));
    expect((await run()).manualReview).toBe(1);
    advance(); await inbox.ingest(delivery("charge.success", { ...provider(), retry: true }));
    expect((await run()).manualReview).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect((await db.select().from(s.paystackEffects))[0].state).toBe("manual_review");
  });
  it("does not replay external effects after their SQL completion write fails", async () => {
    await inbox.ingest(delivery());
    await pg.exec(`create function fail_effect_completion() returns trigger language plpgsql as $$ begin raise exception 'synthetic SQL outage'; end $$;
      create trigger fail_effect_completion before update on paystack_effects for each row execute function fail_effect_completion();`);
    try { await expect(run()).rejects.toThrow(); }
    finally { await pg.exec("drop trigger fail_effect_completion on paystack_effects; drop function fail_effect_completion();"); }
    expect(handle).toHaveBeenCalledTimes(1);
    expect((await db.select().from(s.paystackEffects))[0].state).toBe("started");
    advance(300_001);
    expect((await run()).manualReview).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("does not replay after effects finish but inbox completion fails", async () => {
    await inbox.ingest(delivery());
    await pg.exec(`create function fail_inbox_completion() returns trigger language plpgsql as $$ begin
      if new.state = 'done' then raise exception 'synthetic SQL outage'; end if; return new; end $$;
      create trigger fail_inbox_completion before update on paystack_events for each row execute function fail_inbox_completion();`);
    try { await expect(run()).rejects.toThrow(); }
    finally { await pg.exec("drop trigger fail_inbox_completion on paystack_events; drop function fail_inbox_completion();"); }
    expect((await db.select().from(s.paystackEffects))[0].state).toBe("done");
    advance(300_001);
    expect((await run()).processed).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("refuses effects after a newer reversal observation wins the row lock", async () => {
    await inbox.ingest(delivery()); const event = (await inbox.claim())!;
    const originalAt = clock().toISOString();
    await savePaymentObservation(db, "test", "synthetic-order", provider(), originalAt);
    advance(); await savePaymentObservation(db, "test", "synthetic-order", provider("reversed"), clock().toISOString());
    expect(await inbox.beginEffects(event, originalAt)).toBe("stale");
    expect(await db.select().from(s.paystackEffects)).toHaveLength(0);
  });
  it("preserves fulfilment dates while rejecting an older successful observation", async () => {
    const firstAt = clock().toISOString();
    await savePaymentObservation(db, "test", "synthetic-order", provider(), firstAt);
    await db.update(s.orders).set({ completedAt: firstAt, reviewMessageSentAt: firstAt });
    advance(); await savePaymentObservation(db, "test", "synthetic-order", provider("reversed"), clock().toISOString());
    expect(await savePaymentObservation(db, "test", "synthetic-order", provider(), firstAt)).toBe(false);
    const [row] = await db.select().from(s.orders);
    expect(row.paymentStatus).toBe("reversed"); expect(Date.parse(row.completedAt!)).toBe(base);
    expect(Date.parse(row.reviewMessageSentAt!)).toBe(base);
    expect(await db.select().from(s.orderItems)).toHaveLength(1);
    expect(await db.select().from(s.paymentSnapshots)).toHaveLength(2);
  });
  it("rejects replacement provider IDs and preserves original order snapshots", async () => {
    await savePaymentObservation(db, "test", "synthetic-order", provider(), clock().toISOString()); advance();
    await expect(savePaymentObservation(db, "test", "synthetic-order", { ...provider(), id: 999 }, clock().toISOString())).rejects.toThrow();
    expect((await db.select().from(s.orders).where(eq(s.orders.reference, "synthetic-order")))[0].providerId).toBe("123");
  });
  it("preserves missing historical item prices instead of applying current prices", () => {
    const data = { ...provider(), metadata: { items: [{ qty: 2, name: "Historical" }] } };
    expect(paymentObservation(data, "test", "synthetic-order", clock().toISOString()).items[0].unitPriceMinor).toBeNull();
  });
});
