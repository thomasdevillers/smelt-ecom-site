import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "./schema";
import { discoverPaystack } from "../payments/paystackDiscovery";
import { savePaymentAdjustment } from "./payment-adjustments";
import { savePaymentObservation } from "./payment-observations";
import { paymentOperations } from "./payment-operations";
import { paystackInbox } from "./paystack-events";
import { processPaystackEvents } from "../payments/paystackEventProcessing";

const pg = new PGlite({ extensions: { pg_trgm } }),
  db = drizzle(pg, { schema: s });
const at = "2026-11-01T12:00:00Z",
  later = "2026-11-02T12:00:00Z";
const payment = (id = 1) => ({
  id,
  domain: "test",
  reference: `order-${id}`,
  status: "success",
  amount: 54000,
  currency: "ZAR",
  created_at: at,
  paid_at: at,
  metadata: { cart: { green: 1 }, unitPrice: 450 },
  customer: { id: 12, email: "synthetic@example.invalid" },
});
const refund = (id = 123) => ({
  id,
  domain: "test",
  transaction: 1,
  transaction_reference: "order-1",
  status: "processed",
  amount: 10000,
  currency: "ZAR",
});
const page = (data: unknown[], pageCount = 1) => ({
  data,
  meta: {
    total: data.length ? pageCount * data.length : 0,
    pageCount: data.length ? pageCount : 0,
  },
});
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
}, 30_000);
beforeEach(async () => {
  await pg.exec("truncate environments cascade");
  await db.insert(s.environments).values({ id: "test", paymentMode: "test" });
});
afterAll(async () => {
  await pg.close();
});

describe("checkpointed provider discovery and adjustments", () => {
  it("discovers missed historical orders with no historical purchase/email jobs", async () => {
    const read = vi.fn(async (path: string) =>
      page(path.startsWith("/transaction?") ? [payment()] : []),
    );
    expect(await discoverPaystack(db, "test", read)).toMatchObject({ pages: 3, transactions: 1 });
    expect(await db.select().from(s.orders)).toHaveLength(1);
    expect(await db.select().from(s.paystackEvents)).toHaveLength(0);
    expect(await db.select().from(s.providerSync)).toHaveLength(3);
    expect(read.mock.calls.every(([path]) => path.includes("to="))).toBe(true);
  });
  it("enqueues only a recently discovered paid transaction for shared guarded processing", async () => {
    const fresh = { ...payment(), paid_at: new Date(Date.now() - 1000).toISOString() };
    await discoverPaystack(db, "test", async (path) =>
      page(path.startsWith("/transaction?") ? [fresh] : []),
    );
    expect((await db.select().from(s.paystackEvents))[0]).toMatchObject({
      origin: "discovery",
      eventType: "charge.success",
      state: "pending",
    });
    expect(await db.select().from(s.paystackEffects)).toHaveLength(0);
  });
  it("resumes full-history scans at the persisted page and fixed cutoff after a failed request", async () => {
    const read = vi.fn(async (path: string) => {
      if (!path.startsWith("/transaction?")) return page([]);
      return page(
        [payment(Number(new URL(`https://synthetic.invalid${path}`).searchParams.get("page")))],
        2,
      );
    });
    await discoverPaystack(db, "test", read);
    const first = (
      await db.select().from(s.providerSync).where(eq(s.providerSync.stream, "transaction"))
    )[0];
    expect(first.page).toBe(2);
    expect(first.completedAt).toBeNull();
    await expect(
      discoverPaystack(db, "test", async (path) => {
        if (path.startsWith("/transaction?")) throw new Error("offline");
        return page([]);
      }),
    ).rejects.toThrow();
    expect(
      (await db.select().from(s.providerSync).where(eq(s.providerSync.stream, "transaction")))[0]
        .page,
    ).toBe(2);
    await discoverPaystack(db, "test", read);
    const lastCall = read.mock.calls
      .filter(([path]) => path.startsWith("/transaction?"))
      .at(-1)![0];
    expect(new URL(`https://synthetic.invalid${lastCall}`).searchParams.get("to")).toBe(
      new Date(first.windowEnd).toISOString(),
    );
    expect(await db.select().from(s.orders)).toHaveLength(2);
    expect(
      (await db.select().from(s.providerSync).where(eq(s.providerSync.stream, "transaction")))[0]
        .completedAt,
    ).not.toBeNull();
  });
  it("retains invalid/mixed-mode source records as manual cases without blocking later records", async () => {
    await discoverPaystack(db, "test", async (path) =>
      page(path.startsWith("/transaction?") ? [{ ...payment(), domain: "live" }, payment(2)] : []),
    );
    expect((await db.select().from(s.orders))[0].reference).toBe("order-2");
    expect((await db.select().from(s.paystackEvents))[0]).toMatchObject({
      state: "manual_review",
      reason: "invalid-provider-discovery-record",
    });
  });
  it("rejects incomplete provider pagination before advancing the cursor", async () => {
    await expect(
      discoverPaystack(db, "test", async () => ({ data: [], meta: { total: 100, pageCount: 2 } })),
    ).rejects.toThrow("pagination");
    expect((await db.select().from(s.providerSync))[0].page).toBe(1);
  });
  it("preserves partial refund amounts separately from paid totals and blocks fulfilment", async () => {
    await savePaymentObservation(db, "test", "order-1", payment(), at);
    await savePaymentAdjustment(db, "test", "refund", refund(), later);
    expect((await db.select().from(s.orders))[0]).toMatchObject({
      amountMinor: 54000,
      paymentStatus: "success",
      paymentReview: "refund",
    });
    expect((await db.select().from(s.paymentAdjustments))[0]).toMatchObject({
      amountMinor: 10000,
      status: "processed",
      reference: "order-1",
    });
    await savePaymentAdjustment(db, "test", "refund", { ...refund(), status: "pending" }, at);
    expect((await db.select().from(s.paymentAdjustments))[0].status).toBe("processed");
  });
  it("links adjustments discovered before their order using the exact provider transaction ID", async () => {
    const data = { ...refund(), transaction_reference: undefined };
    await savePaymentAdjustment(db, "test", "refund", data, at);
    expect((await db.select().from(s.paymentAdjustments))[0].reference).toBeNull();
    await savePaymentObservation(db, "test", "order-1", payment(), later);
    expect((await db.select().from(s.paymentAdjustments))[0].reference).toBe("order-1");
    expect((await db.select().from(s.orders))[0].paymentReview).toBe("refund");
  });
  it("reconciles authenticated refund events through a fresh read without refunding or sending anything", async () => {
    await savePaymentObservation(db, "test", "order-1", payment(), at);
    await paystackInbox(db, "test").ingest(
      JSON.stringify({ event: "refund.processed", data: { id: 123, domain: "test" } }),
    );
    const handle = vi.fn(),
      adjustment = vi.fn().mockResolvedValue(refund());
    const result = await processPaystackEvents("test", { db, verify: vi.fn(), handle, adjustment });
    expect(result.processed).toBe(1);
    expect(adjustment).toHaveBeenCalledWith("refund", 123);
    expect(handle).not.toHaveBeenCalled();
    expect((await db.select().from(s.orders))[0].paymentReview).toBe("refund");
  });
  it("tracks disputes even when their transaction snapshot still reports success", async () => {
    await savePaymentObservation(db, "test", "order-1", payment(), at);
    await savePaymentAdjustment(
      db,
      "test",
      "dispute",
      {
        id: 99,
        domain: "test",
        status: "awaiting-merchant-feedback",
        refund_amount: 54000,
        currency: "ZAR",
        transaction: payment(),
      },
      later,
    );
    expect((await db.select().from(s.orders))[0].paymentReview).toBe("dispute");
  });
});

describe("audited payment-event resolutions", () => {
  const operations = paymentOperations(db, "test");
  it("lists held events without signed raw payloads and records resolution evidence", async () => {
    const inbox = paystackInbox(db, "test"),
      id = await inbox.ingest(JSON.stringify({ event: "charge.success", data: payment() }));
    const event = (await inbox.claim())!;
    await inbox.finish(event, "manual_review", "verification-retries-exhausted");
    const list = await operations.list();
    expect(list.total).toBe(1);
    expect(list.events[0]).not.toHaveProperty("raw");
    await operations.resolve(
      id,
      "retry-verification",
      "Provider recovered; checked original reference.",
    );
    expect((await db.select().from(s.paystackEvents))[0]).toMatchObject({
      state: "pending",
      resolution: { history: [expect.objectContaining({ action: "retry-verification" })] },
    });
  });
  it("cannot reset or replay an external-attempt guard, even after operator acknowledgement", async () => {
    const inbox = paystackInbox(db, "test"),
      id = await inbox.ingest(JSON.stringify({ event: "charge.success", data: payment() }));
    const event = (await inbox.claim())!;
    await savePaymentObservation(db, "test", "order-1", payment(), at);
    expect(await inbox.beginEffects(event, at)).toBe("started");
    await inbox.finish(event, "manual_review", "external-processing-unconfirmed");
    await expect(
      operations.resolve(id, "retry-verification", "Provider acceptance is still ambiguous."),
    ).rejects.toThrow("external attempt");
    await operations.resolve(
      id,
      "acknowledge",
      "Resend accepted original message; receipt reconciled privately.",
    );
    expect((await db.select().from(s.paystackEffects))[0].state).toBe("started");
    expect((await db.select().from(s.paystackEvents))[0].state).toBe("done");
  });
});
