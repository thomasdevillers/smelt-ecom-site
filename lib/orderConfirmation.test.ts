import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
const mocks = vi.hoisted(() => ({
  db: { get: vi.fn(), set: vi.fn(), eval: vi.fn() }, send: vi.fn(), verify: vi.fn(), after: vi.fn(), commitInventory: vi.fn(), commitVoucher: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.db; } } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./paystack", () => ({ verifyTransaction: mocks.verify }));
vi.mock("./metaConversions", () => ({ sendMetaPurchase: vi.fn() }));
vi.mock("./tiktokEvents", () => ({ sendTikTokPurchase: vi.fn() }));
vi.mock("./inventory", () => ({ commitInventory: mocks.commitInventory }));
vi.mock("./vouchers", () => ({
  parseVoucherMetadata: (value: unknown) => value && typeof value === "object" && (value as { amount?: unknown }).amount === 50 ? value : null,
  commitVoucher: mocks.commitVoucher,
}));
import { sendOrderConfirmation, sendOwnerOrderNotification, type ConfirmedOrder } from "./orderConfirmation";
import { checkoutTotal } from "./checkoutShared";
import { POST as webhook } from "../app/api/paystack/webhook/route";
import { POST as verifyPost, GET as verifyGet } from "../app/api/checkout/verify/route";

const store = new Map<string, unknown>();
const order: ConfirmedOrder = {
  reference: "paid-confirmation-test", email: "buyer@example.com", currency: "ZAR",
  cart: { green: 1, cream: 0 }, amount: checkoutTotal({ green: 1, cream: 0 }) * 100,
  address: { line1: "1 Test Street", city: "Cape Town", province: "Western Cape", postalCode: "8001" },
};
beforeEach(() => {
  vi.resetAllMocks(); store.clear();
  for (const [key, value] of Object.entries({
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "fake",
    RESEND_API_KEY: "fake", ORDER_FROM_EMAIL: "Smelt <orders@example.com>",
    SITE_URL: "https://saunahat.co.za", PAYSTACK_SECRET_KEY: "fake-paystack",
  })) vi.stubEnv(key, value);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.db.get.mockImplementation(async (key) => store.get(key) ?? null);
  mocks.db.set.mockImplementation(async (key, value) => { store.set(key, value); return "OK"; });
  mocks.db.eval.mockImplementation(async (_script, [key], [value]) => {
    if (!store.has(key)) store.set(key, JSON.parse(value));
    return store.get(key);
  });
  mocks.send.mockResolvedValue({ data: { id: "resend-accepted-1" }, error: null });
  mocks.commitInventory.mockResolvedValue(true);
  mocks.commitVoucher.mockResolvedValue(true);
  mocks.verify.mockResolvedValue({ ...order, status: "success", customerEmail: order.email,
    metadata: { cart: order.cart, shippingAddress: order.address, items: [{ name: "FORGED ITEM", qty: 99 }] } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function webhookRequest(amount = order.amount, signatureValid = true, shippingMethod?: unknown) {
  const body = JSON.stringify({ event: "charge.success", data: {
    ...order, amount, status: "success", customer: { email: order.email },
    paid_at: "2026-09-26T05:00:00.000Z",
    metadata: { cart: order.cart, shippingAddress: order.address, shippingMethod, customerName: "Test Buyer" },
  } });
  const signature = createHmac("sha512", "fake-paystack").update(body).digest("hex");
  return new Request("https://example.com/api/paystack/webhook", { method: "POST", body,
    headers: { "x-paystack-signature": signatureValid ? signature : "bad" } });
}
async function flush() {
  const callbacks = mocks.after.mock.calls.splice(0);
  for (const [callback] of callbacks) await callback();
}

describe("confirmation delivery", () => {
  it("sends the branded receipt with reconciled total, catalogue items, and address", async () => {
    await sendOrderConfirmation(order);
    const message = mocks.send.mock.calls[0][0];
    expect(message).toMatchObject({ to: order.email, from: "Smelt <orders@example.com>" });
    expect(message.subject).toContain("confirmed");
    expect(message.html).toContain("1 Test Street");
    expect(message.text).toContain(`R${order.amount / 100}`);
    expect(message.html).toContain("https://saunahat.co.za/images/");
    expect([...store.values()]).toEqual([{ status: "accepted", id: "resend-accepted-1" }]);
    await sendOrderConfirmation(order);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("retries provider rejection with the original payload and idempotency key", async () => {
    mocks.send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded" } });
    await expect(sendOrderConfirmation(order)).rejects.toThrow("resend_not_accepted");
    const first = mocks.send.mock.calls[0];
    vi.stubEnv("ORDER_FROM_EMAIL", "Changed <changed@example.com>");
    await sendOrderConfirmation({ ...order, email: "changed@example.com" });
    expect(mocks.send.mock.calls[1]).toEqual(first);
  });

  it("retains pending state across timeouts and lost acceptance writes", async () => {
    mocks.send.mockRejectedValueOnce(new Error("network timeout"));
    await expect(sendOrderConfirmation(order)).rejects.toThrow("network timeout");
    mocks.db.set.mockRejectedValueOnce(new Error("redis write lost"));
    await expect(sendOrderConfirmation(order)).rejects.toThrow("redis write lost");
    await sendOrderConfirmation(order);
    expect(mocks.send.mock.calls[2]).toEqual(mocks.send.mock.calls[0]);
  });

  it("freezes the same message and key when callbacks race", async () => {
    await Promise.all([sendOrderConfirmation(order), sendOrderConfirmation({ ...order, email: "changed@example.com" })]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    // Resend deduplicates these identical concurrent requests. Both callbacks share one receipt.
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
    expect(store.size).toBe(1);
  });

  it("stops ambiguous attempts before Resend's 24-hour deduplication expires", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(sendOrderConfirmation(order)).rejects.toThrow();
    const pending = [...store.values()][0] as { startedAt: number };
    pending.startedAt -= 23 * 60 * 60 * 1000;
    await expect(sendOrderConfirmation(order)).rejects.toThrow("manual_review_required");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("fails visibly when configuration or persistence is unavailable, before sending", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendOrderConfirmation(order)).rejects.toThrow("missing_resend");
    vi.stubEnv("RESEND_API_KEY", "fake");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    await expect(sendOrderConfirmation(order)).rejects.toThrow("missing_redis");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake");
    mocks.db.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(sendOrderConfirmation(order)).rejects.toThrow("redis unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("payment route integration", () => {
  it.each(["POST", "GET", "webhook"])("reconciles founder delivery through %s and includes it in the receipt", async (route) => {
    const amount = 545000;
    mocks.verify.mockResolvedValue({ ...order, amount, status: "success", customerEmail: order.email,
      metadata: { cart: order.cart, shippingAddress: order.address, shippingMethod: "founders" } });
    const response = route === "webhook"
      ? await webhook(webhookRequest(amount, true, "founders"))
      : route === "GET"
        ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))
        : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }));
    expect(response.status).toBe(200);
    await flush();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const message = mocks.send.mock.calls[0][0];
    expect(message.text).toContain("R5 450");
    expect(message.text).toContain("Hand delivered by founders");
    expect(message.text).toContain("next business day");
    expect(message.text).not.toContain("tracking");
  });

  it.each(["founders", "unknown", null])("rejects underpaid or invalid shipping %s in both verification routes and webhook", async (shippingMethod) => {
    mocks.verify.mockResolvedValue({ ...order, status: "success", customerEmail: order.email,
      metadata: { cart: order.cart, shippingMethod } });
    expect((await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference, shippingMethod: "aramex" }) }))).status).toBe(409);
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(409);
    expect((await webhook(webhookRequest(order.amount, true, shippingMethod))).status).toBe(200);
    await flush();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends once across a signed webhook, browser POST, GET, and webhook replay", async () => {
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect((await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }))).status).toBe(200);
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(200);
    await flush();
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].html).not.toContain("FORGED ITEM");
  });

  it("commits a server-created stock reservation before fulfilling the paid order", async () => {
    mocks.verify.mockResolvedValue({ ...order, status: "success", customerEmail: order.email,
      metadata: { cart: order.cart, shippingAddress: order.address, shippingMethod: "aramex", inventoryReservation: order.reference } });
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(200);
    expect(mocks.commitInventory).toHaveBeenCalledWith(order.reference, order.cart);
  });

  it("reconciles and commits an R50 review voucher before confirming the discounted order", async () => {
    const voucher = { id: "a".repeat(64), amount: 50 };
    mocks.verify.mockResolvedValue({ ...order, amount: 49_000, status: "success", customerEmail: order.email,
      metadata: { cart: order.cart, shippingAddress: order.address, shippingMethod: "aramex", inventoryReservation: order.reference, voucher } });
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(200);
    expect(mocks.commitVoucher).toHaveBeenCalledWith(order.reference, voucher);
    await flush();
    const message = mocks.send.mock.calls[0][0];
    expect(message.text).toContain("Review voucher");
    expect(message.text).toContain("R490");
  });

  it("does not fulfil a paid order whose stock reservation cannot be reconciled", async () => {
    mocks.commitInventory.mockResolvedValueOnce(false);
    mocks.verify.mockResolvedValue({ ...order, status: "success", customerEmail: order.email,
      metadata: { cart: order.cart, shippingAddress: order.address, shippingMethod: "aramex", inventoryReservation: order.reference } });
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(409);
    await flush();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends from browser verification even when the webhook has not arrived", async () => {
    expect((await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))).status).toBe(200);
    await flush();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("returns 503 for webhook send failure and accepts a successful retry", async () => {
    mocks.send.mockResolvedValueOnce({ error: { name: "validation_error" }, data: null });
    expect((await webhook(webhookRequest())).status).toBe(503);
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[2]);
  });

  it("keeps payment successful when the fallback email fails", async () => {
    mocks.send.mockRejectedValue(new Error("Resend unavailable"));
    const response = await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    await flush();
    expect(console.error).toHaveBeenCalled();
  });

  it("never sends for invalid signatures, failed payments or mismatched amounts", async () => {
    expect((await webhook(webhookRequest(order.amount, false))).status).toBe(401);
    expect((await webhook(webhookRequest(1))).status).toBe(200);
    mocks.verify.mockResolvedValueOnce({ status: "failed" });
    expect((await verifyGet(new Request("https://example.com/api/checkout/verify?reference=failed"))).status).toBe(400);
    await flush();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not acknowledge a webhook when its signing secret is missing", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect((await webhook(webhookRequest())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("owner notifications", () => {
  it("includes customer, address, quantities, paid date, totals and admin link only in the owner email", async () => {
    await sendOwnerOrderNotification({ ...order, customerName: "Test <Buyer>", paidAt: "2026-09-26T05:00:00.000Z", address: { ...order.address as object, phone: "0821234567", company: "Test Estate", addressLine2: "Unit 4" } });
    const message = mocks.send.mock.calls[0][0];
    expect(message.to).toBe("thomasdevilliers100@gmail.com");
    for (const text of ["buyer@example.com", "0821234567", "Test Estate", "Unit 4", "1 Test Street", "Forest Green", "R450", "R90", "R540", "07:00", "SAST", "https://saunahat.co.za/admin"]) expect(message.text).toContain(text);
    expect(message.html).toContain("Test &lt;Buyer&gt;");
    expect(message.html).not.toContain("Test <Buyer>");
    expect(message.subject).toContain("[TEST]");
    await sendOwnerOrderNotification(order);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await sendOrderConfirmation(order);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].to).toBe(order.email);
    expect(store.size).toBe(2);
  });
  it("retries a failed owner alert without duplicating the customer confirmation", async () => {
    mocks.send.mockImplementation(async (message) => message.to === "thomasdevilliers100@gmail.com"
      ? { data: null, error: { name: "rate_limit_exceeded" } }
      : { data: { id: "customer-accepted" }, error: null });
    expect((await webhook(webhookRequest())).status).toBe(503);
    const firstOwnerCall = mocks.send.mock.calls.find(([message]) => message.to === "thomasdevilliers100@gmail.com");
    expect(firstOwnerCall?.[0].text).toContain("Test Buyer");
    expect(firstOwnerCall?.[0].text).toContain("07:00");
    mocks.send.mockResolvedValue({ data: { id: "owner-accepted" }, error: null });
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect(mocks.send.mock.calls.filter(([message]) => message.to === order.email)).toHaveLength(1);
    const ownerCalls = mocks.send.mock.calls.filter(([message]) => message.to === "thomasdevilliers100@gmail.com");
    expect(ownerCalls).toHaveLength(2);
    expect(ownerCalls[0]).toEqual(ownerCalls[1]);
    expect((await webhook(webhookRequest())).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });
  it("uses the existing pre-order date and quantities in the owner notification", async () => {
    await sendOwnerOrderNotification({ ...order, preorder: { batch: "2026-10-22", arrival: "22 October 2026", quantities: { green: 1, cream: 0 } } });
    const message = mocks.send.mock.calls[0][0];
    expect(message.subject).toContain("pre-order");
    expect(message.text).toContain("1 green, 0 cream");
    expect(message.text).toContain("ready on 22 October 2026");
  });
});
