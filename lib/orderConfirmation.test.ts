vi.mock("./salesMode", async original => ({ ...await original<typeof import("./salesMode")>(), PREORDER_MODE: true }));
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
const mocks = vi.hoisted(() => ({
  db: { get: vi.fn(), set: vi.fn(), eval: vi.fn() }, send: vi.fn(), verify: vi.fn(), after: vi.fn(), commitInventory: vi.fn(), commitVoucher: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.db; } } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./paystack", () => ({ verifyTransaction: mocks.verify }));
vi.mock("./metaConversions", () => ({ sendMetaPurchase: vi.fn() }));
vi.mock("./inventory", () => ({ commitInventory: mocks.commitInventory }));
vi.mock("./vouchers", () => ({
  parseVoucherMetadata: (value: unknown) => value && typeof value === "object" && (value as { amount?: unknown }).amount === 50 ? value : null,
  commitVoucher: mocks.commitVoucher,
}));
import { sendOrderConfirmation, sendOwnerOrderNotification, type ConfirmedOrder } from "./orderConfirmation";
import { checkoutTotal } from "./checkoutShared";
import { PRICING_VERSION } from "./pricing";
import { captureTouch, mergeAttribution } from "./attribution";
import { POST as webhook } from "../app/api/paystack/webhook/route";
import { POST as verifyPost, GET as verifyGet } from "../app/api/checkout/verify/route";

const store = new Map<string, unknown>();
const order: ConfirmedOrder = {
  reference: "paid-confirmation-test", email: "buyer@example.com", currency: "ZAR",
  paidAt: "2026-09-26T05:00:00.000Z",
  cart: { green: 1, cream: 0 }, amount: checkoutTotal({ green: 1, cream: 0 }) * 100,
  address: { line1: "1 Test Street", city: "Cape Town", province: "Western Cape", postalCode: "8001" },
};
beforeEach(() => {
  vi.resetAllMocks(); store.clear();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T05:05:00.000Z"));
  for (const [key, value] of Object.entries({
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "fake",
    RESEND_API_KEY: "fake", ORDER_FROM_EMAIL: "Smelt <orders@example.com>",
    SITE_URL: "https://saunahat.co.za", PAYSTACK_SECRET_KEY: "fake-paystack",
  })) vi.stubEnv(key, value);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
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

function webhookRequest(amount = order.amount, signatureValid = true, shippingMethod?: unknown, metadata: Record<string, unknown> = {}, payment: ConfirmedOrder = order) {
  const body = JSON.stringify({ event: "charge.success", data: {
    ...payment, amount, status: "success", customer: { email: payment.email },
    paid_at: payment.paidAt,
    metadata: { cart: payment.cart, shippingAddress: payment.address, shippingMethod, customerName: "Test Buyer", ...metadata },
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
  it.each(["webhook", "verify-get", "verify-post"].flatMap(flow => [
    { flow, query: "?utm_source=meta&utm_campaign=October%20%3Cpromo%3E&utm_content=video_01", label: "Meta" },
    { flow, query: "", label: "Not Meta" },
    { flow, query: null, label: "Not recorded" },
  ]))("includes Source: $label in the owner email through $flow", async ({ flow, query, label }) => {
    const attribution = query === null ? null : mergeAttribution(null, captureTouch(new URL(`https://saunahat.co.za/product${query}`), "", Date.parse("2026-10-06T10:00:00Z")), Date.parse("2026-10-06T10:00:00Z"));
    mocks.verify.mockResolvedValue({ ...order, status: "success", customerEmail: order.email, metadata: { cart: order.cart, shippingAddress: order.address, attribution } });
    const response = flow === "webhook" ? await webhook(webhookRequest(order.amount, true, undefined, { attribution }))
      : flow === "verify-get" ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))
      : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference, attribution: { forged: true } }) }));
    expect(response.status).toBe(200);
    if (flow === "verify-get") expect(await response.json()).not.toHaveProperty("attribution");
    await flush();
    const owner = mocks.send.mock.calls.find(([message]) => message.to !== order.email)![0];
    const customer = mocks.send.mock.calls.find(([message]) => message.to === order.email)![0];
    expect(owner.cc).toBe("marcpape7@icloud.com");
    expect(customer).not.toHaveProperty("cc");
    expect(owner.text).toContain(`Source: ${label}`);
    expect(owner.html).toContain(`<strong>Source:</strong> ${label}`);
    expect(owner.text).not.toContain("video_01");
    expect(owner.html).not.toContain("October");
    expect(customer.text).not.toContain("Source:");
    expect(customer.html).not.toContain("October");
  });
  it("returns only sanitized delivery fields after verified payment and prevents caching", async () => {
    mocks.verify.mockResolvedValueOnce({ ...order, status: "success", metadata: {
      cart: order.cart,
      shippingAddress: { line1: " 1 Test Street ", city: "Cape Town", province: "Western Cape",
        postalCode: "8001", phone: "0831234567",
        lat: -33.9249, lng: 18.4241, placeId: "test-place", secret: "private" },
    } });
    const response = await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.address).toMatchObject({ line1: "1 Test Street", lat: -33.9249, lng: 18.4241, placeId: "test-place" });
    expect(data.address).not.toHaveProperty("phone");
    expect(data.address).not.toHaveProperty("secret");
  });

  it("keeps historical paid orders without delivery metadata accessible", async () => {
    mocks.verify.mockResolvedValueOnce({ ...order, status: "success", metadata: { cart: order.cart } });
    const response = await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`));
    expect(response.status).toBe(200);
    expect((await response.json()).address).toBeNull();
  });

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
  it.each(["POST", "GET", "webhook"].flatMap(route => [
    { route, version: PRICING_VERSION, amount: 64000 },
    { route, version: "hat-bundles-v2", amount: 55000 },
  ]))("reconciles one R550 hat through $route under $version", async ({ route, version, amount }) => {
    const cart = { green: 1, cream: 0 };
    const metadata = { cart, unitPrice: 550, pricingVersion: version, shippingMethod: "aramex" };
    mocks.verify.mockResolvedValue({ ...order, amount, status: "success", customerEmail: order.email, metadata });
    const response = route === "webhook"
      ? await webhook(webhookRequest(amount, true, "aramex", metadata))
      : route === "GET"
        ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))
        : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }));
    expect(response.status).toBe(200);
    await flush();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const owner = mocks.send.mock.calls.find(([message]) => message.to !== order.email)![0];
    expect(owner.text).toContain(version === PRICING_VERSION ? "R640" : "R550");
    expect(owner.text).toContain(version === PRICING_VERSION ? "R90" : "R0");
  });

  it.each([
    ["POST", 3], ["GET", 3], ["webhook", 3],
    ["POST", 4], ["GET", 4], ["webhook", 4],
  ])("reconciles through %s a mixed %i-hat bundle with voucher and receipt discounts", async (route, qty) => {
    const count = Number(qty);
    const cart = { green: 2, cream: count - 2 };
    const amount = (count === 3 ? 1200 : 1550) * 100;
    const metadata = { cart, unitPrice: 450, pricingVersion: PRICING_VERSION, shippingMethod: "aramex", voucher: { amount: 50 } };
    mocks.verify.mockResolvedValue({ ...order, amount, status: "success", customerEmail: order.email, metadata });
    const response = route === "webhook"
      ? await webhook(webhookRequest(amount, true, "aramex", metadata))
      : route === "GET"
        ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))
        : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }));
    expect(response.status).toBe(200);
    await flush();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    for (const [message] of mocks.send.mock.calls) {
      expect(message.text).toContain("Bundle discount");
      expect(message.text).toContain(count === 3 ? "R100" : "R200");
      expect(message.text).toContain(count === 3 ? "R1 200" : "R1 550");
    }
  });

  it.each(["POST", "GET", "webhook"])("preserves older mixed four-hat payments through %s", async route => {
    const cart = { green: 2, cream: 2 };
    const metadata = { cart, unitPrice: 450 };
    mocks.verify.mockResolvedValue({ ...order, amount: 180000, status: "success", customerEmail: order.email, metadata });
    const response = route === "webhook"
      ? await webhook(webhookRequest(180000, true, "aramex", metadata))
      : route === "GET"
        ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${order.reference}`))
        : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: order.reference }) }));
    expect(response.status).toBe(200);
    await flush();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].text).toContain("R1 800");
    expect(mocks.send.mock.calls[0][0].text).not.toContain("Bundle discount");
  });

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
    expect(message.cc).toBe("marcpape7@icloud.com");
    for (const text of ["buyer@example.com", "0821234567", "Test Estate", "Unit 4", "1 Test Street", "Forest Green", "R450", "R90", "R540", "07:00", "SAST", "https://saunahat.co.za/admin"]) expect(message.text).toContain(text);
    expect(message.html).toContain("Test &lt;Buyer&gt;");
    expect(message.html).not.toContain("Test <Buyer>");
    expect(message.subject).toContain("[TEST]");
    await sendOwnerOrderNotification(order);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await sendOrderConfirmation(order);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].to).toBe(order.email);
    expect(mocks.send.mock.calls[1][0]).not.toHaveProperty("cc");
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
    expect(firstOwnerCall?.[0].cc).toBe("marcpape7@icloud.com");
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
    expect(message.text).toContain("Expected 22 October 2026");
  });
});

describe("historical payment notification protection", () => {
  const hour = 60 * 60 * 1000;
  const receiptKey = (reference: string, family: string) =>
    `smelt:${family}:v1:${createHash("sha256").update(reference).digest("hex")}`;

  it.each(["GET", "POST", "webhook"])("does not backfill an owner alert for an already-confirmed old order through %s", async route => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-12T06:43:00Z"));
    const historicalOrder = { ...order, reference: "T209526682706087", amount: 135000,
      cart: { green: 3, cream: 0 }, paidAt: "2026-09-17T19:01:14.000Z" };
    // Customer confirmations existed before owner alerts were introduced.
    store.set(receiptKey(historicalOrder.reference, "order-confirmation"), { status: "accepted", id: "september-confirmation" });
    mocks.verify.mockResolvedValue({ ...historicalOrder, status: "success", customerEmail: historicalOrder.email,
      metadata: { cart: historicalOrder.cart } });
    const response = route === "webhook"
      ? await webhook(webhookRequest(historicalOrder.amount, true, undefined, {}, historicalOrder))
      : route === "GET"
        ? await verifyGet(new Request(`https://example.com/api/checkout/verify?reference=${historicalOrder.reference}`))
        : await verifyPost(new Request("https://example.com/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: historicalOrder.reference }) }));
    expect(response.status).toBe(200);
    if (route === "GET") expect(await response.json()).toMatchObject({ paid: true, reference: historicalOrder.reference });
    await flush();
    expect(mocks.send.mock.calls).toHaveLength(0);
    expect(mocks.db.eval).not.toHaveBeenCalled();
    expect(mocks.db.set).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("manual reconciliation"), expect.objectContaining({ audience: "owner" }));
  });

  it.each([sendOrderConfirmation, sendOwnerOrderNotification])("does not create a first email at or beyond the 24-hour boundary", async send => {
    for (const age of [24 * hour, 30 * 24 * hour]) {
      await send({ ...order, paidAt: new Date(Date.now() - age).toISOString() });
    }
    expect(mocks.send.mock.calls).toHaveLength(0);
    expect(mocks.db.eval).not.toHaveBeenCalled();
  });

  it.each([sendOrderConfirmation, sendOwnerOrderNotification])("allows a first notification just before the 24-hour boundary", async send => {
    await send({ ...order, paidAt: new Date(Date.now() - 24 * hour + 1).toISOString() });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, "", "invalid", "2026-09-27T05:00:00Z"])("does not guess payment recency from an invalid paidAt: %s", async paidAt => {
    await expect(sendOwnerOrderNotification({ ...order, paidAt })).rejects.toThrow("order_confirmation_invalid_paid_at");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.db.eval).not.toHaveBeenCalled();
  });

  it("keeps accepted notifications deduplicated even without a payment timestamp", async () => {
    store.set(receiptKey(order.reference, "owner-order"), { status: "accepted", id: "already-sent" });
    await expect(sendOwnerOrderNotification({ ...order, paidAt: null })).resolves.toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([sendOrderConfirmation, sendOwnerOrderNotification])("retries an existing attempt after the payment ages past 24 hours without changing its payload", async send => {
    const paidAt = new Date(Date.now() - 23 * hour).toISOString();
    mocks.send.mockRejectedValueOnce(new Error("network timeout"));
    await expect(send({ ...order, paidAt })).rejects.toThrow("network timeout");
    const firstAttempt = mocks.send.mock.calls[0];
    const retryAt = Date.now() + 2 * hour;
    vi.mocked(Date.now).mockReturnValue(retryAt);
    await send({ ...order, paidAt, customerName: "Changed name" });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]).toEqual(firstAttempt);
    await send({ ...order, paidAt });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("still stops an ambiguous owner retry after the existing 23-hour retry window", async () => {
    mocks.send.mockRejectedValueOnce(new Error("network timeout"));
    await expect(sendOwnerOrderNotification(order)).rejects.toThrow("network timeout");
    vi.mocked(Date.now).mockReturnValue(Date.now() + 23 * hour);
    await expect(sendOwnerOrderNotification(order)).rejects.toThrow("manual_review_required");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
