import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "./db/schema";
import { persistPaystackEvent, reconcileKnownPaystackOrders, runPaystackEvents } from "./paystackEventWorker";
import { GET as eventsCron } from "../app/api/cron/paystack-events/route";
import { GET as reconcileCron } from "../app/api/cron/paystack-reconcile/route";

const mocks = vi.hoisted(() => ({ database: vi.fn(), process: vi.fn(), handle: vi.fn() }));
vi.mock("./db/client", () => ({ postgresStore: () => { mocks.database(); return { db }; } }));
vi.mock("./paystackEventProcessing", () => ({ processPaystackEvents: mocks.process }));
vi.mock("./paystackLegacyEvent", () => ({ handleLegacyPaystackEvent: mocks.handle }));
const pg = new PGlite({ extensions: { pg_trgm } }), db = drizzle(pg, { schema });
const fetcher = vi.fn<typeof fetch>();
const at = "2026-01-01T00:00:00Z";
const transaction = (reference: string, status = "reversed") => ({ id: 123, domain: "test", reference, status, amount: 54000, currency: "ZAR",
  created_at: at, paid_at: at, customer: { email: "synthetic@example.invalid" }, metadata: { cart: { green: 1 }, unitPrice: 450 } });
beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); }, 30_000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec("truncate environments cascade"); vi.resetAllMocks();
  vi.stubEnv("PAYSTACK_EVENT_STORE", "postgres"); vi.stubEnv("PAYSTACK_EVENT_PAUSED", "false");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_synthetic"); vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("CRON_SECRET", "synthetic-cron");
  vi.stubGlobal("fetch", fetcher); mocks.process.mockResolvedValue({ processed: 1 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Paystack worker activation and known-order reconciliation", () => {
  it("does not load the database or call providers in the default legacy mode", async () => {
    vi.stubEnv("PAYSTACK_EVENT_STORE", "");
    expect(await runPaystackEvents()).toMatchObject({ skipped: true });
    expect(await reconcileKnownPaystackOrders()).toMatchObject({ skipped: true });
    expect(mocks.database).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("pauses workers while retaining durable ingestion", async () => {
    vi.stubEnv("PAYSTACK_EVENT_PAUSED", "true");
    expect(await runPaystackEvents()).toMatchObject({ skipped: true, paused: true });
    expect(await reconcileKnownPaystackOrders()).toMatchObject({ skipped: true, paused: true });
    expect(mocks.database).not.toHaveBeenCalled();
    await persistPaystackEvent("test", JSON.stringify({ event: "charge.success", data: transaction("synthetic") }));
    expect(await db.select().from(schema.paystackEvents)).toHaveLength(1);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("rejects previews, invalid pause values and ambiguous payment mode before database access", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); await expect(runPaystackEvents()).rejects.toThrow();
    vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("PAYSTACK_EVENT_PAUSED", "typo"); await expect(runPaystackEvents()).rejects.toThrow();
    vi.stubEnv("PAYSTACK_EVENT_PAUSED", "false"); vi.stubEnv("PAYSTACK_SECRET_KEY", "ambiguous"); await expect(runPaystackEvents()).rejects.toThrow();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("delegates active workers to durable processing", async () => {
    expect(await runPaystackEvents()).toEqual({ processed: 1 });
    expect(mocks.process).toHaveBeenCalledWith("test", expect.objectContaining({ db, handle: mocks.handle }));
  });
  it("reconciles a known stub without financial/email actions and rotates its next check", async () => {
    await db.insert(schema.environments).values([{ id: "test", paymentMode: "test" }, { id: "live", paymentMode: "live" }]);
    await db.insert(schema.orders).values([
      { environment: "test", reference: "synthetic", paymentStatus: "unknown", snapshot: {}, completedAt: at },
      { environment: "live", reference: "untouched", paymentStatus: "unknown", snapshot: {} },
    ]);
    fetcher.mockResolvedValue(Response.json({ status: true, data: transaction("synthetic") }));
    expect(await reconcileKnownPaystackOrders()).toEqual({ checked: 1, updated: 1, failed: 0 });
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.environment, "test"));
    expect(order.paymentStatus).toBe("reversed"); expect(Date.parse(order.completedAt!)).toBe(Date.parse(at));
    expect(order.reconcileAfter).not.toBeNull(); expect(order.observedAt).not.toBeNull();
    expect(await reconcileKnownPaystackOrders()).toEqual({ checked: 0, updated: 0, failed: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(mocks.handle).not.toHaveBeenCalled(); expect(mocks.process).not.toHaveBeenCalled();
  });
  it("rotates failed checks without falsely updating payment observations", async () => {
    await db.insert(schema.environments).values({ id: "test", paymentMode: "test" });
    await db.insert(schema.orders).values({ environment: "test", reference: "synthetic", paymentStatus: "unknown", snapshot: {} });
    fetcher.mockRejectedValue(new Error("private upstream error"));
    expect(await reconcileKnownPaystackOrders()).toEqual({ checked: 1, updated: 0, failed: 1 });
    const [order] = await db.select().from(schema.orders);
    expect(order.observedAt).toBeNull(); expect(order.reconcileAfter).not.toBeNull();
    expect(await db.select().from(schema.paymentSnapshots)).toEqual([]);
  });
});

describe("Paystack cron authorization and failure responses", () => {
  it("rejects unauthenticated work before any database/provider access", async () => {
    for (const handler of [eventsCron, reconcileCron]) expect((await handler(new Request("https://synthetic.invalid"))).status).toBe(401);
    expect(mocks.database).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns aggregate no-store responses for authorised disabled jobs", async () => {
    vi.stubEnv("PAYSTACK_EVENT_STORE", "legacy");
    for (const handler of [eventsCron, reconcileCron]) {
      const response = await handler(new Request("https://synthetic.invalid", { headers: { authorization: "Bearer synthetic-cron" } }));
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ skipped: true });
    }
  });
  it("returns retryable, non-sensitive failures when SQL is unavailable", async () => {
    mocks.database.mockImplementation(() => { throw new Error("postgres://private-credentials"); });
    for (const handler of [eventsCron, reconcileCron]) {
      const response = await handler(new Request("https://synthetic.invalid", { headers: { authorization: "Bearer synthetic-cron" } }));
      expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-credentials");
    }
  });
});
