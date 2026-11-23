import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "./schema";
import { orderDomain, type PendingShipment } from "./order-domain";
import { savePaymentObservation } from "./payment-observations";
import { orderStore, assertOrdersWritable } from "../orderPersistence";
import { sendManualShipping, sendShipping, shippingStatus } from "../admin/shipping";
import { listOrders, findPaidOrdersByEmail, setOrderCompleted, markReviewMessageSent } from "../admin/orders";
import { completedOrderDates, orderCompletedAt } from "../orderFulfilment";
import { exportOrdersCsv } from "../admin/orderExport";
import { publicReceipt } from "../admin/receipts";

const mocks = vi.hoisted(() => ({ send: vi.fn(), status: vi.fn(), redis: vi.fn(), fetch: vi.fn(), paid: vi.fn() }));
vi.mock("./client", () => ({ postgresStore: () => ({ db }) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send, get: mocks.status }; } }));
vi.mock("../purchaseStore", () => ({ fulfilmentAllocationOverrides: async () => ({}), batchReceived: async () => true,
  purchaseNeedsReview: async () => false, resolvePurchasePreorder: async (_reference: string, value: unknown) => value }));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { mocks.redis(); throw new Error("Redis business read forbidden"); } } }));
const pg = new PGlite({ extensions: { pg_trgm } }), db = drizzle(pg, { schema: s }), domain = orderDomain(db, "test");
const at = "2026-11-21T12:00:00.000Z", email = "synthetic@example.invalid";
const provider = (reference = "order-1", id = 1) => ({ id, reference, domain: "test", status: "success", amount: 54000, currency: "ZAR", created_at: at, paid_at: at,
  customer: { id: 123, email, first_name: "Historical" }, metadata: { cart: { green: 1 }, unitPrice: 450, customerName: "Synthetic Buyer" } });
const pending = (reference?: string, trackingNumber = "123456789"): PendingShipment => ({ status: "pending", trackingNumber, email, reference,
  startedAt: Date.now(), source: reference ? "dashboard" : "manual", message: { from: "sender@example.invalid", to: email, subject: "Frozen", html: "Original", text: "Original" } });
beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); }, 30_000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec("truncate environments cascade"); vi.resetAllMocks();
  vi.stubEnv("ORDER_STORE", "postgres"); vi.stubEnv("ORDER_PAUSED", "false"); vi.stubEnv("PAYSTACK_EVENT_STORE", "postgres");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_synthetic"); vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("RESEND_API_KEY", "synthetic"); vi.stubEnv("ORDER_FROM_EMAIL", "sender@example.invalid");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ status: true, data: provider() }));
  mocks.send.mockResolvedValue({ data: { id: "provider-message" }, error: null });
  await savePaymentObservation(db, "test", "order-1", provider(), "2026-11-20T12:00:00Z");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("SQL orders and fulfilment", () => {
  it("links real provider customers without inventing a customer creation date", async () => {
    expect((await db.select().from(s.customers))[0]).toMatchObject({ id: "123", email, createdAt: null });
    expect((await domain.find("order-1"))?.customerId).toBe("123");
  });
  it("keeps completion and review dates stable and enforces shipping acceptance", async () => {
    await expect(domain.complete("order-1", true)).rejects.toThrow("shipping email");
    const receipt = await domain.reserve(pending("order-1"));
    await domain.accept({ ...publicReceipt(receipt), status: "accepted", id: "provider", acceptedAt: at });
    const completed = await domain.complete("order-1", true);
    expect(await domain.complete("order-1", true)).toBe(completed);
    const review = await domain.reviewMessage("order-1"); expect(await domain.reviewMessage("order-1")).toBe(review);
    expect(await orderCompletedAt("order-1")).toBe(completed); expect(await completedOrderDates()).toEqual({ "order-1": completed });
    await domain.complete("order-1", false); expect(await orderCompletedAt("order-1")).toBeNull();
    expect((await domain.find("order-1"))?.reviewMessageSentAt).not.toBeNull();
    expect(mocks.redis).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses indexed SQL search/filter/pagination and allocation overrides before totals", async () => {
    for (let i = 2; i <= 28; i++) {
      const reference = `smeltp-${String(i).padStart(2, "0")}`;
      await savePaymentObservation(db, "test", reference, { ...provider(reference, i), metadata: { ...provider().metadata,
        preorder: { batch: "2026-11-30", arrival: "30 November", quantities: { green: 1, cream: 0 } } } }, at);
    }
    const first = await domain.page(1, "synthetic", "active", "newest", {});
    expect(first.total).toBe(28); expect(first.rows).toHaveLength(25); expect(first.pageCount).toBe(2);
    const last = await domain.page(99, "synthetic", "active", "newest", {}); expect(last.page).toBe(2); expect(last.rows).toHaveLength(3);
    const preorders = await domain.page(1, "synthetic", "preorders", "newest", { "smeltp-02": { green: 0, cream: 0 } });
    expect(preorders.total).toBe(26); expect(preorders.preorderToFulfil.green).toBe(26);
    expect(preorders.rows.some(row => row.reference === "smeltp-02")).toBe(false);
    expect((await domain.page(1, "%", "active", "newest", {})).total).toBe(0);
    expect((await domain.page(1, "example.invalid", "active", "newest", {})).total).toBe(28);
  });
  it("connects admin search, email lookup and CSV to SQL without a Paystack list call", async () => {
    expect((await listOrders(1, "Synthetic")).orders[0].reference).toBe("order-1");
    expect(await findPaidOrdersByEmail(email)).toHaveLength(1);
    expect(await exportOrdersCsv()).toContain("540.00");
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.redis).not.toHaveBeenCalled();
  });
  it("retains fresh Paystack checks for completion and manual review-date mutations", async () => {
    await sendShipping("order-1", "123456789");
    expect(await setOrderCompleted("order-1", true)).toBeTruthy();
    expect(await markReviewMessageSent("order-1")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
  it("fails closed on pause, invalid selection and previews without provider fallback", async () => {
    vi.stubEnv("ORDER_PAUSED", "true"); await expect(sendShipping("order-1", "123456789")).rejects.toThrow("paused");
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("ORDER_PAUSED", "typo"); expect(assertOrdersWritable).toThrow();
    vi.stubEnv("VERCEL_ENV", "preview"); expect(() => orderStore()).toThrow();
    vi.stubEnv("ORDER_STORE", "typo"); expect(() => orderStore()).toThrow();
  });
  it("uses the search index on a synthetic dashboard-size dataset", async () => {
    await db.execute(sql`insert into orders (environment, reference, payment_status, snapshot, search_text)
      select 'test', 'load-' || n, 'success', '{}'::jsonb, 'ordinary synthetic ' || n from generate_series(1, 5000) n`);
    await db.update(s.orders).set({ searchText: "rare-search-needle" }).where(eq(s.orders.reference, "order-1"));
    await db.execute(sql`select gin_clean_pending_list('orders_search')`);
    await db.execute(sql`analyze orders`);
    const plan = await db.execute(sql`explain (format json) select reference from orders where environment = 'test' and payment_status = 'success' and search_text ilike '%rare-search-needle%'`);
    expect(JSON.stringify(plan)).toContain("orders_search");
  });
});

describe("SQL shipment ownership and durable receipts", () => {
  it("serializes competing order reservations and preserves the first frozen message", async () => {
    const [a, b] = await Promise.all([domain.reserve(pending("order-1")), domain.reserve(pending("order-1", "987654321"))]);
    expect(a.trackingNumber).toBe(b.trackingNumber); expect(await db.select().from(s.shipments)).toHaveLength(1);
    expect((await domain.shipment("order-1"))?.message?.text).toBe("Original");
  });
  it("links a manual accepted email/waybill receipt without changing its original payload", async () => {
    const receipt = await domain.reserve(pending());
    await domain.accept({ ...publicReceipt(receipt), status: "accepted", id: "manual-id", acceptedAt: at });
    expect((await domain.reserve(pending("order-1"))).id).toBe("manual-id");
    expect((await domain.shipment("order-1"))?.reference).toBeUndefined();
    expect(await domain.complete("order-1", true)).toBeTruthy();
  });
  it("shares dashboard/manual receipts and prevents a duplicate send", async () => {
    await sendShipping("order-1", "123456789");
    expect(await sendManualShipping({ email, trackingNumber: "123456789" })).toBe("provider-message");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: expect.stringMatching(/^shipping-/) });
  });
  it("retains pending evidence after ambiguous acceptance and does not extend retry deadlines", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider accepted but response lost"));
    await expect(sendManualShipping({ email, trackingNumber: "123456789" })).rejects.toThrow();
    const [row] = await db.select().from(s.shipments), original = row.payload;
    await sendManualShipping({ email, trackingNumber: "123456789", name: "Changed" });
    expect(mocks.send.mock.calls[1][0]).toEqual(original.message);
    expect((await db.select().from(s.shipments))[0].payload.startedAt).toBe(original.startedAt);
  });
  it("blocks an expired pending send and never exposes the frozen message", async () => {
    await domain.reserve({ ...pending(), startedAt: Date.now() - 24 * 60 * 60 * 1000 });
    await expect(sendManualShipping({ email, trackingNumber: "123456789" })).rejects.toThrow("manual review");
    expect(mocks.send).not.toHaveBeenCalled();
    const receipt = await domain.reserve(pending("order-1")); expect(publicReceipt(receipt)).not.toHaveProperty("message");
  });
  it("refreshes delivery status without changing acceptance/provider identity", async () => {
    await sendShipping("order-1", "123456789");
    mocks.status.mockResolvedValue({ data: { to: [email], last_event: "delivered" } });
    expect((await shippingStatus("order-1"))?.lastEvent).toBe("delivered"); expect(mocks.send).toHaveBeenCalledOnce();
    const current = (await domain.shipment("order-1"))!;
    await expect(domain.accept({ ...current, id: "another-provider-id" })).rejects.toThrow("review");
  });
  it("retains local-only accepted receipts and rejects conflicting import evidence", async () => {
    const receipt = { ...publicReceipt(pending()), status: "accepted" as const, id: "local-history", acceptedAt: at };
    await domain.importShipping(receipt); await domain.importShipping(receipt);
    expect(await domain.history(email)).toHaveLength(1);
    await expect(domain.importShipping({ ...receipt, id: "different" })).rejects.toThrow("conflicts");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks fulfilment for a payment flagged by refund/dispute reconciliation", async () => {
    await db.update(s.orders).set({ paymentReview: "refund" });
    await expect(sendShipping("order-1", "123456789")).rejects.toThrow("refund");
    await expect(domain.complete("order-1", true)).rejects.toThrow("review"); expect(mocks.send).not.toHaveBeenCalled();
  });
});
