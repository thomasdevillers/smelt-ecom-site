import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ hgetall: vi.fn(), hsetnx: vi.fn(), hget: vi.fn(), hdel: vi.fn(), eval: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn(), send: vi.fn(), emailGet: vi.fn(), cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, fetch: vi.fn(), pipeline: { get: vi.fn(), hgetall: vi.fn(), exec: vi.fn() } }));
vi.mock("@upstash/redis", () => ({ Redis: class { hgetall = mocks.hgetall; hsetnx = mocks.hsetnx; hget = mocks.hget; hdel = mocks.hdel; eval = mocks.eval; get = mocks.get; set = mocks.set; del = mocks.del; pipeline = () => mocks.pipeline; } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send, get: mocks.emailGet }; } }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
import { normalizeOrder, listOrders, setOrderCompleted, completionKey } from "./orders";
import { sendShipping, shippingStatus } from "./shipping";
import { publicReceipt } from "./receipts";
import { hasAdminSession, login, logout } from "./auth";
import { digest } from "./store";
import { GET as ordersGET, PATCH as ordersPATCH } from "@/app/api/admin/orders/route";
import { POST as shippingPOST } from "@/app/api/admin/shipping/route";
import type { ShippingReceipt } from "./types";
const transaction = { reference: "order-1", status: "success", amount: 54000, currency: "ZAR", customer: { email: "customer@example.com" }, metadata: { cart: { green: 1 }, shippingAddress: { line1: "1 Test St", city: "Cape Town" }, customerName: "Test Customer" } };
const pending = (): ShippingReceipt & { message: object } => ({ status: "pending", trackingNumber: "25249853610844", email: "customer@example.com", reference: "order-1", startedAt: Date.now(), source: "dashboard", message: { from: "Smelt <orders@example.com>", to: "customer@example.com", subject: "Original subject", html: "Original HTML", text: "Original text" } });
const request = (body: object, origin = "https://saunahat.co.za") => new Request("https://saunahat.co.za/api/admin/shipping", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_PASSWORD", "a-long-test-password-for-admin");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example"); vi.stubEnv("RESEND_API_KEY", "re_test_example"); vi.stubEnv("ORDER_FROM_EMAIL", "Smelt <orders@example.com>");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: true, data: transaction }) });
  mocks.eval.mockImplementation(async (_script, _keys, args) => args[0] ? JSON.parse(args[0]) : 1);
  mocks.hgetall.mockResolvedValue({});
  mocks.pipeline.exec.mockResolvedValue([]);
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
});
describe("order records", () => {
  it("supports current and historical metadata without repricing paid orders", () => {
    expect(normalizeOrder(transaction)).toMatchObject({ canShip: true, email: "customer@example.com", shippingMethod: "aramex", amount: 54000 });
    expect(normalizeOrder({ ...transaction, metadata: JSON.stringify({ items: [{ colour: "cream", name: "Cream", qty: 2 }] }) })).toMatchObject({ canShip: true, items: [{ qty: 2 }] });
    expect(normalizeOrder({ ...transaction, amount: 12345 })).toMatchObject({ canShip: true, amount: 12345 });
  });
  it("blocks failed payments, missing items, invalid email and founder delivery", () => {
    for (const change of [{ status: "failed" }, { metadata: {} }, { customer: { email: "bad" } }, { metadata: { ...transaction.metadata, shippingMethod: "founders" } }]) expect(normalizeOrder({ ...transaction, ...change }).canShip).toBe(false);
  });
  it("paginates and removes frozen message content from the returned receipt", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: true, data: Array.from({ length: 60 }, (_, i) => ({ ...transaction, reference: `order-${i}` })), meta: { total: 60, pageCount: 1 } }) });
    mocks.pipeline.exec.mockResolvedValue([pending(), null]);
    const result = await listOrders(2);
    expect(result).toMatchObject({ total: 60, page: 2, pageCount: 3 });
    expect(result.orders[0].receipt).not.toHaveProperty("message");
    expect(mocks.fetch.mock.calls[0][0]).toContain("perPage=100");
    expect(mocks.fetch.mock.calls[0][0]).toContain("status=success");
  });
});
describe("shipping lifecycle", () => {
  it("sends to the verified payment email and saves acceptance permanently", async () => {
    const result = await sendShipping("order-1", "25249853610844");
    expect(result).toMatchObject({ status: "accepted", id: "email-1" });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "customer@example.com", subject: "Your Smelt order is on the move 📦" });
    expect(mocks.send.mock.calls[0][0].html).toContain("waybill=25249853610844");
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toMatch(/^shipping-/);
    expect(mocks.eval).toHaveBeenCalledTimes(2);
    expect(result).not.toHaveProperty("message");
  });
  it("does not resend accepted receipts, including imported manual sends", async () => {
    mocks.eval.mockResolvedValue({ ...pending(), status: "accepted", source: "manual", id: "existing" });
    expect(await sendShipping("order-1", "25249853610844")).toMatchObject({ id: "existing" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects changed waybills and old or unlinked ambiguous attempts", async () => {
    for (const receipt of [{ ...pending(), trackingNumber: "111111" }, { ...pending(), startedAt: Date.now() - 24 * 60 * 60 * 1000 }, { ...pending(), reference: undefined, source: "manual" }]) {
      mocks.eval.mockResolvedValue(receipt);
      await expect(sendShipping("order-1", "25249853610844")).rejects.toThrow();
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retries a recent ambiguous attempt using its original frozen payload", async () => {
    const saved = pending(); mocks.eval.mockResolvedValue(saved);
    await sendShipping("order-1", "25249853610844");
    expect(mocks.send.mock.calls[0][0]).toEqual(saved.message);
  });
  it("retains pending state when the provider outcome is uncertain", async () => {
    mocks.send.mockResolvedValue({ error: { message: "timeout" } });
    await expect(sendShipping("order-1", "25249853610844")).rejects.toThrow("unconfirmed");
    expect(mocks.eval).toHaveBeenCalledTimes(1);
  });
  it("does not contact the provider for invalid waybills or non-paid orders", async () => {
    await expect(sendShipping("order-1", "abc")).rejects.toThrow("waybill");
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: true, data: { ...transaction, status: "failed" } }) });
    await expect(sendShipping("order-1", "25249853610844")).rejects.toThrow("successful payment");
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.eval).not.toHaveBeenCalled();
  });
  it("refreshes provider status without sending another message", async () => {
    mocks.get.mockResolvedValue({ ...publicReceipt(pending()), status: "accepted", id: "email-1" });
    mocks.emailGet.mockResolvedValue({ data: { to: ["customer@example.com"], last_event: "delivered" } });
    expect(await shippingStatus("order-1")).toMatchObject({ lastEvent: "delivered" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
describe("admin access", () => {
  it("protects order reads and sends without exposing data", async () => {
    expect((await ordersGET(new Request("https://saunahat.co.za/api/admin/orders"))).status).toBe(401);
    expect((await shippingPOST(request({ reference: "order-1", trackingNumber: "25249853610844" }))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before authentication or email calls", async () => {
    expect((await shippingPOST(request({}, "https://evil.example"))).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rate limits login and issues only opaque HttpOnly sessions", async () => {
    await expect(login(request({}), "wrong")).rejects.toThrow("Incorrect");
    await login(request({}), "a-long-test-password-for-admin");
    expect(mocks.cookies.set).toHaveBeenCalledWith("smelt_admin", expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ httpOnly: true, sameSite: "strict", maxAge: 43200 }));
    mocks.eval.mockResolvedValue(0);
    await expect(login(request({}), "a-long-test-password-for-admin")).rejects.toThrow("Too many");
  });
  it("invalidates sessions after password rotation and deletes sessions on logout", async () => {
    mocks.cookies.get.mockReturnValue({ value: "a".repeat(64) });
    mocks.get.mockResolvedValue({ credential: digest("a-long-test-password-for-admin") });
    expect(await hasAdminSession()).toBe(true);
    vi.stubEnv("ADMIN_PASSWORD", "another-long-test-password");
    expect(await hasAdminSession()).toBe(false);
    await logout(); expect(mocks.del).toHaveBeenCalledOnce(); expect(mocks.cookies.delete).toHaveBeenCalledWith("smelt_admin");
  });
});

describe("order completion", () => {
  it("requires a successful payment and accepted shipping email before completion", async () => {
    mocks.get.mockResolvedValue({ status: "pending" });
    await expect(setOrderCompleted("order-1", true)).rejects.toThrow("Send the shipping email");
    expect(mocks.hsetnx).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue({ status: "accepted", id: "email-1" });
    mocks.hget.mockResolvedValue("2026-09-16T12:00:00.000Z");
    expect(await setOrderCompleted("order-1", true)).toBe("2026-09-16T12:00:00.000Z");
    expect(mocks.hsetnx).toHaveBeenCalledWith(completionKey(), "order-1", expect.any(String));
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reopens an order without deleting its shipping receipt or sending email", async () => {
    expect(await setOrderCompleted("order-1", false)).toBeNull();
    expect(mocks.hdel).toHaveBeenCalledWith(completionKey(), "order-1");
    expect(mocks.del).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("filters across Paystack pages before paginating active and completed orders", async () => {
    mocks.fetch.mockImplementation(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: true,
      data: Array.from({length: url.includes("page=1") ? 100 : 2}, (_, i) => ({ ...transaction, reference: `order-${url.includes("page=1") ? i : i+100}` })), meta: {total: 102, pageCount: 2} }) }));
    mocks.hgetall.mockResolvedValue(Object.fromEntries(Array.from({length: 90}, (_, i) => [`order-${i}`, "2026-09-16T12:00:00.000Z"])));
    const active = await listOrders(1);
    expect(active).toMatchObject({ total: 12, activeTotal: 12, completedTotal: 90, pageCount: 1 });
    expect(active.orders[0].reference).toBe("order-90");
    expect(active.orders[11].reference).toBe("order-101");
    const completed = await listOrders(2, "", "completed");
    expect(completed).toMatchObject({ total: 90, page: 2, pageCount: 4 });
    expect(completed.orders).toHaveLength(25);
    expect(completed.orders.every(o => !!o.completedAt)).toBe(true);
  });
  it("protects completion mutations with session and origin checks", async () => {
    expect((await ordersPATCH(request({ reference: "order-1", completed: true }))).status).toBe(401);
    expect((await ordersPATCH(request({}, "https://evil.example"))).status).toBe(403);
    expect(mocks.hsetnx).not.toHaveBeenCalled();
  });
});
