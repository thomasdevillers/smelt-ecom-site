import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as s from "../../lib/db/schema";
import { classify, sha256, type Snapshot } from "./baseline";
import { planOrders, type PaystackCapture, type Mode } from "./order-plan";
import { applyOrderPlan, reconcileOrderPlans, verifyOrderPlan } from "./order-write";
import { capturePaystackOrders } from "./order-capture";

const at = "2026-11-01T12:00:00.000Z";
const raw = (reference = "order-1", id = 1) => ({
  id,
  reference,
  domain: "test",
  status: "success",
  amount: 72000,
  currency: "ZAR",
  created_at: at,
  paid_at: at,
  customer: { id: 99, email: "synthetic@example.invalid" },
  metadata: { unitPrice: 310, items: [{ name: "Historical hat", colour: "green", qty: 2 }] },
});
const capture = (transactions: unknown[] = [raw()]): PaystackCapture => ({
  version: 1,
  environment: "test",
  startedAt: at,
  completedAt: at,
  total: transactions.length,
  transactions,
});
const snapshot = (key: string, logical: unknown, type = "string"): Snapshot => ({
  kind: "redis",
  key,
  type,
  logical,
  pttl: -1,
  expiresAt: null,
  observedAt: at,
  cardinality: 1,
  dump: "",
  checksum: sha256(""),
  classification: classify(key),
  unstable: false,
});
const email = "synthetic@example.invalid",
  trackingNumber = "123456789",
  pair = sha256(`${email}\n${trackingNumber}`);
const pairKey = `smelt:shipping:receipt:v1:${pair}`,
  orderKey = `smelt:shipping:order:v1:${sha256("order-1")}`,
  historyKey = `smelt:shipping:history:v1:${sha256(email)}`;
const receipt = () => ({
  email,
  trackingNumber,
  status: "accepted",
  source: "dashboard",
  reference: "order-1",
  startedAt: Date.parse(at),
  acceptedAt: at,
  id: "resend-original",
});
const records = () => [
  snapshot("smelt:orders:completed:v1:test", [["order-1", at]], "hash"),
  snapshot("smelt:orders:review-message-sent:v1:test", [["order-1", at]], "hash"),
  snapshot(pairKey, receipt()),
  snapshot(orderKey, JSON.stringify(receipt())),
  snapshot(historyKey, [[pair, receipt()]], "hash"),
];
const ownership: Record<string, Mode> = {
  [pairKey]: "test",
  [orderKey]: "test",
  [historyKey]: "test",
};
const plan = () => planOrders(capture(), records(), "archive-checksum", ownership);

describe("offline order/fulfilment planning", () => {
  it("preserves amounts, original item details, dates, provider payloads and three shipping aliases", () => {
    const result = plan();
    expect(result.rejected).toEqual([]);
    expect(result.orders[0]).toMatchObject({
      amountMinor: 72000,
      completedAt: at,
      reviewMessageSentAt: at,
      snapshot: raw(),
      items: [
        {
          quantity: 2,
          unitPriceMinor: 31000,
          snapshot: { name: "Historical hat", colour: "green", qty: 2 },
        },
      ],
    });
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].sources).toHaveLength(3);
    expect(result.shipments[0].payload).toEqual(receipt());
    expect(plan().digest).toBe(result.digest);
  });
  it("never invents a missing historical price or product name", () => {
    const old = { ...raw(), metadata: { cart: { green: 2, cream: 0 } } };
    const result = planOrders(capture([old]), [], "archive");
    expect(result.rejected).toEqual([]);
    expect(result.orders[0].items).toEqual([
      {
        position: 0,
        quantity: 2,
        unitPriceMinor: null,
        currency: "ZAR",
        snapshot: { colour: "green", qty: 2 },
      },
    ]);
  });
  it("requires explicit shipping ownership even when the order and email match", () => {
    expect(planOrders(capture(), records(), "archive").rejected).toHaveLength(3);
  });
  it("preserves unlinked pending manual receipts, frozen messages and original retry starts", () => {
    const pending = {
      email,
      trackingNumber,
      status: "pending",
      source: "manual",
      startedAt: Date.parse(at),
      message: { to: email, html: "Frozen original" },
    };
    const result = planOrders(capture(), [snapshot(pairKey, pending)], "archive", ownership);
    expect(result.rejected).toEqual([]);
    expect(result.shipments[0]).toMatchObject({
      orderReference: null,
      payload: pending,
      startedAt: at,
    });
  });
  it("quarantines conflicting aliases rather than choosing the accepted/newest payload", () => {
    const rows = records();
    rows[2].logical = { ...receipt(), status: "pending" };
    expect(
      planOrders(capture(), rows, "archive", ownership).rejected.some(
        (row) => row.reason === "shipping-alias-payload-conflict",
      ),
    ).toBe(true);
  });
  it("rejects bad amounts, provider mode, statuses and duplicate transactions", () => {
    for (const invalid of [
      { ...raw(), amount: 1.1 },
      { ...raw(), domain: "live" },
      { ...raw(), status: "mystery" },
    ])
      expect(planOrders(capture([invalid]), [], "archive").rejected).toHaveLength(1);
    expect(planOrders(capture([raw(), raw()]), [], "archive").rejected[0].reason).toBe(
      "duplicate-provider-transaction",
    );
  });
  it("retains reversed payments and raw statuses without treating them as new purchases", () => {
    const result = planOrders(capture([{ ...raw(), status: "reversed" }]), [], "archive");
    expect(result.orders[0].paymentStatus).toBe("reversed");
    expect(result.orders[0].snapshot.status).toBe("reversed");
  });
  it("quarantines orphan dates, unknown sources, expiring/unstable records and bad aliases", () => {
    const rows = [
      snapshot("smelt:orders:completed:v1:test", [["missing", at]], "hash"),
      snapshot("smelt:orders:unknown:v1:test", {}),
      { ...snapshot(pairKey, receipt()), unstable: true },
      { ...snapshot(orderKey, receipt()), expiresAt: at },
      snapshot(historyKey, [["wrong-field", receipt()]], "hash"),
    ];
    expect(planOrders(capture(), rows, "archive", ownership).rejected).toHaveLength(5);
  });
  it("keeps explicitly different environments out of the selected import", () => {
    const result = planOrders(
      capture(),
      [
        snapshot("smelt:orders:completed:v1:live", [["missing", at]], "hash"),
        snapshot(pairKey, receipt()),
      ],
      "archive",
      { [pairKey]: "live" },
    );
    expect(result.rejected).toEqual([]);
    expect(result.shipments).toEqual([]);
    expect(result.sources.every((row) => row.decision === "other-environment")).toBe(true);
  });
  it("retains local-only shipping history with explicit ownership and exact evidence", () => {
    const path = ".local/shipping/receipts/shipping-synthetic.json";
    const content = JSON.stringify({
      email,
      trackingNumber,
      status: "accepted",
      id: "original-provider-id",
      acceptedAt: at,
      name: "Original name",
    });
    const local = [{ path, content, checksum: sha256(content) }];
    expect(planOrders(capture(), [], "archive", {}, local).rejected).toHaveLength(1);
    const result = planOrders(capture(), [], "archive", { [path]: "test" }, local);
    expect(result.rejected).toEqual([]);
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].payload.localEvidence).toEqual([
      { path, checksum: sha256(content), record: JSON.parse(content) },
    ]);
    expect(result.shipments[0].orderReference).toBeNull();
  });
  it("merges matching local evidence without mutating inputs or changing the frozen shared payload", () => {
    const path = ".local/shipping/receipts/shipping-synthetic.json";
    const content = JSON.stringify({
      email,
      trackingNumber,
      status: "accepted",
      id: "resend-original",
      acceptedAt: at,
    });
    const local = [{ path, content, checksum: sha256(content) }],
      rows = records(),
      owners = { ...ownership, [path]: "test" as const };
    const first = planOrders(capture(), rows, "archive", owners, local),
      second = planOrders(capture(), rows, "archive", owners, local);
    expect(first.digest).toBe(second.digest);
    expect(first.shipments[0].payload.startedAt).toBe(receipt().startedAt);
    expect(first.shipments[0].sources).toHaveLength(4);
    expect(rows[2].logical).not.toHaveProperty("localEvidence");
  });
  it("preserves an accepted manual receipt later linked to an order by its exact source alias", () => {
    const payload = { ...receipt(), reference: undefined, source: "manual" };
    const result = planOrders(
      capture(),
      [snapshot(pairKey, payload), snapshot(orderKey, payload)],
      "archive",
      ownership,
    );
    expect(result.rejected).toEqual([]);
    expect(result.shipments[0].orderReference).toBeNull();
    expect(result.shipments[0].sources).toHaveLength(2);
  });
});

describe("GET-only Paystack capture", () => {
  it("reads every page without a success-only filter", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ status: true, data: [raw()], meta: { total: 2, pageCount: 2 } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: true,
          data: [{ ...raw("order-2", 2), status: "reversed" }],
          meta: { total: 2, pageCount: 2 },
        }),
      );
    expect(
      (await capturePaystackOrders("sk_test_synthetic", "test", request)).transactions,
    ).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, options] of request.mock.calls) {
      expect(new URL(String(url)).searchParams.has("status")).toBe(false);
      expect(options?.method).toBe("GET");
    }
  });
  it("rejects changing totals, overlapping pages, missing pages and mixed environments", async () => {
    for (const second of [
      { status: true, data: [raw("order-2", 2)], meta: { total: 3, pageCount: 2 } },
      { status: true, data: [raw()], meta: { total: 2, pageCount: 2 } },
      { status: true, data: [], meta: { total: 2, pageCount: 2 } },
      {
        status: true,
        data: [{ ...raw("order-2", 2), domain: "live" }],
        meta: { total: 2, pageCount: 2 },
      },
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ status: true, data: [raw()], meta: { total: 2, pageCount: 2 } }),
        )
        .mockResolvedValueOnce(Response.json(second));
      await expect(capturePaystackOrders("sk_test_synthetic", "test", request)).rejects.toThrow();
    }
  });
  it("rejects a mismatched key before any request", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(capturePaystackOrders("sk_live_synthetic", "test", request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("checkpointed order backfill on isolated PostgreSQL", () => {
  const pg = new PGlite({ extensions: { pg_trgm } }),
    db = drizzle(pg, { schema: s });
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  }, 30_000);
  beforeEach(async () => {
    await db.execute(sql`truncate environments, migration_imports cascade`);
  });
  afterAll(async () => {
    await pg.close();
  });
  it("enriches a Phase 4 stub atomically and verifies complete records", async () => {
    await db.insert(s.environments).values({ id: "test", paymentMode: "test" });
    await db.insert(s.orders).values({
      environment: "test",
      reference: "order-1",
      paymentStatus: "unknown",
      snapshot: {},
    });
    expect(await applyOrderPlan(db, plan())).toEqual({ inserted: 2, checkpointed: 0 });
    expect((await verifyOrderPlan(db, plan())).valid).toBe(true);
    expect(await db.select().from(s.paymentSnapshots)).toHaveLength(1);
    expect(await db.select().from(s.shipmentSources)).toHaveLength(3);
  });
  it("reruns without duplicating orders, snapshots, items, receipts or checkpoints", async () => {
    await applyOrderPlan(db, plan());
    expect(await applyOrderPlan(db, plan())).toEqual({ inserted: 0, checkpointed: 2 });
    expect(await db.select().from(s.orderItems)).toHaveLength(1);
    expect(await db.select().from(s.migrationImports)).toHaveLength(2);
    expect((await verifyOrderPlan(db, plan())).amountMinor).toEqual({ "ZAR:success": 72000 });
  });
  it("resumes after interruption following a committed order", async () => {
    let first = true;
    await expect(
      applyOrderPlan(db, plan(), async () => {
        if (first) {
          first = false;
          throw new Error("interrupted");
        }
      }),
    ).rejects.toThrow();
    expect(await db.select().from(s.orders)).toHaveLength(1);
    expect(await db.select().from(s.shipments)).toHaveLength(0);
    expect(await applyOrderPlan(db, plan())).toEqual({ inserted: 1, checkpointed: 1 });
    expect((await verifyOrderPlan(db, plan())).valid).toBe(true);
  });
  it("rejects changed-source checkpoints and preserves newer destination writes", async () => {
    await applyOrderPlan(db, plan());
    const changed = plan();
    changed.orders[0].amountMinor = 999;
    await expect(applyOrderPlan(db, changed)).rejects.toThrow();
    await db.update(s.orders).set({ completedAt: "2026-11-20T12:00:00Z" });
    await applyOrderPlan(db, plan());
    expect((await verifyOrderPlan(db, plan())).valid).toBe(false);
    expect(Date.parse((await db.select().from(s.orders))[0].completedAt!)).toBe(
      Date.parse("2026-11-20T12:00:00Z"),
    );
  });
  it("does not recreate deleted imported records", async () => {
    await applyOrderPlan(db, plan());
    await db.delete(s.shipmentSources);
    await db.delete(s.shipments);
    await applyOrderPlan(db, plan());
    expect(await db.select().from(s.shipments)).toHaveLength(0);
    expect((await verifyOrderPlan(db, plan())).valid).toBe(false);
  });
  it("rolls back an order, observation and checkpoint if line items fail", async () => {
    const broken = plan();
    broken.orders[0].items[0].quantity = 0;
    await expect(applyOrderPlan(db, broken)).rejects.toThrow();
    expect(await db.select().from(s.orders)).toEqual([]);
    expect(await db.select().from(s.paymentSnapshots)).toEqual([]);
    expect(await db.select().from(s.migrationImports)).toEqual([]);
  });
  it("refuses to overwrite an enriched order without a checkpoint", async () => {
    await db.insert(s.environments).values({ id: "test", paymentMode: "test" });
    await db.insert(s.orders).values({
      environment: "test",
      reference: "order-1",
      paymentStatus: "success",
      snapshot: { existing: true },
    });
    await expect(applyOrderPlan(db, plan())).rejects.toThrow();
    expect((await db.select().from(s.orders))[0].snapshot).toEqual({ existing: true });
  });
  it("blocks all writes when the plan contains any quarantine", async () => {
    const rejected = planOrders(capture(), records(), "archive");
    await expect(applyOrderPlan(db, rejected)).rejects.toThrow();
    expect(await db.select().from(s.orders)).toEqual([]);
  });
  it("supports identical references in separate environments and rejects cross-mode foreign keys", async () => {
    await applyOrderPlan(db, plan());
    const live = planOrders(
      { ...capture([{ ...raw(), domain: "live" }]), environment: "live" },
      [],
      "live-archive",
    );
    await applyOrderPlan(db, live);
    expect(await db.select().from(s.orders)).toHaveLength(2);
    await db.insert(s.environments).values({ id: "other", paymentMode: "test" });
    await expect(
      db.insert(s.paymentSnapshots).values({
        environment: "other",
        id: "orphan",
        orderReference: "order-1",
        observedAt: at,
        source: "backfill",
        payload: {},
      }),
    ).rejects.toThrow();
    expect((await verifyOrderPlan(db, live)).valid).toBe(true);
  });
  it("detects unexpected enriched orders and missing source aliases", async () => {
    await applyOrderPlan(db, plan());
    await db.insert(s.orders).values({
      environment: "test",
      reference: "unexpected",
      providerId: "999",
      paymentStatus: "success",
      snapshot: {},
    });
    await db.delete(s.shipmentSources).where(eq(s.shipmentSources.sourceKey, pairKey));
    const result = await verifyOrderPlan(db, plan());
    expect(result.valid).toBe(false);
    expect(result.mismatches.map((row) => row.table)).toEqual(["shipments", "unexpected-order"]);
  });
  it("reconciles an explicitly approved final capture against the exact imported baseline", async () => {
    const before = plan();
    await applyOrderPlan(db, before);
    const rows = records();
    rows[0] = snapshot("smelt:orders:completed:v1:test", [], "hash");
    const after = planOrders(
      { ...capture(), completedAt: "2026-11-02T12:00:00Z" },
      rows,
      "final-archive",
      ownership,
    );
    expect(await reconcileOrderPlans(db, before, after)).toEqual({
      reconciled: 1,
      inserted: 0,
      checkpointed: 1,
    });
    expect((await verifyOrderPlan(db, after)).valid).toBe(true);
    expect((await db.select().from(s.orders))[0].completedAt).toBeNull();
    expect((await reconcileOrderPlans(db, before, after)).checkpointed).toBe(2);
    expect(await db.select().from(s.paymentSnapshots)).toHaveLength(2);
  });
  it("refuses final reconciliation over newer destination writes or unexplained source removal", async () => {
    const before = plan();
    await applyOrderPlan(db, before);
    const after = planOrders(
      { ...capture(), completedAt: "2026-11-02T12:00:00Z" },
      records(),
      "final-archive",
      ownership,
    );
    await db.update(s.orders).set({ completedAt: "2026-11-20T12:00:00Z" });
    await expect(reconcileOrderPlans(db, before, after)).rejects.toThrow();
    await expect(reconcileOrderPlans(db, before, { ...after, shipments: [] })).rejects.toThrow(
      "removals",
    );
    expect(Date.parse((await db.select().from(s.orders))[0].completedAt!)).toBe(
      Date.parse("2026-11-20T12:00:00Z"),
    );
  });
  it("reconciles shipment status and alias changes without sending or restarting pending state", async () => {
    const rows = records();
    for (let i = 2; i < rows.length; i++) {
      const value = {
        ...receipt(),
        status: "pending",
        message: { to: email, html: "original frozen message" },
      };
      rows[i].logical = i === 4 ? [[pair, value]] : value;
    }
    const before = planOrders(capture(), rows, "first-archive", ownership);
    await applyOrderPlan(db, before);
    const after = plan();
    expect((await reconcileOrderPlans(db, before, after)).reconciled).toBe(1);
    expect((await verifyOrderPlan(db, after)).valid).toBe(true);
    expect((await db.select().from(s.shipments))[0].payload.id).toBe("resend-original");
  });
});
