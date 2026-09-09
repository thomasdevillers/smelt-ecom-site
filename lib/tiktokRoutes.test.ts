import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(true), purchase: vi.fn().mockResolvedValue(undefined),
  verify: vi.fn(), after: vi.fn(), meta: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./orderConfirmation", () => ({ sendOrderConfirmation: vi.fn(), tryOrderConfirmation: vi.fn(), logOrderConfirmationFailure: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./tiktokEvents", async (original) => ({ ...await original<typeof import("./tiktokEvents")>(), sendTikTokEvents: mocks.send, sendTikTokPurchase: mocks.purchase }));
vi.mock("./paystack", () => ({ verifyTransaction: mocks.verify }));
vi.mock("./metaConversions", () => ({ sendMetaPurchase: mocks.meta }));
vi.mock("./email", () => ({ sendPaymentFailedEmail: vi.fn() }));
import { POST as relay } from "../app/api/tiktok/events/route";
import { GET as verifyGet, POST as verifyPost } from "../app/api/checkout/verify/route";
import { POST as webhook } from "../app/api/paystack/webhook/route";
const origin = "https://saunahat.co.za";
const request = (body: unknown, headers = {}) => new Request(`${origin}/api/tiktok/events`, { method: "POST", headers: { origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const browse = { event: "InitiateCheckout", event_id: "checkout-123", url: `${origin}/checkout?email=private`, parameters: { value: 1, currency: "USD", contents: [{ content_id: "smelt-sauna-hat-green", quantity: 1 }] }, user: { email: "raw@example.com" } };
const verified = { status: "success", reference: "paid-123", amount: 54000, currency: "ZAR", customerEmail: "buyer@example.com", paidAt: null, metadata: { cart: { green: 1, cream: 0 }, tiktokClient: { ttclid: "click-123" } } };
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockResolvedValue(verified); });
async function flush() { for (const [callback] of mocks.after.mock.calls) await callback(); }

describe("TikTok route trust boundaries", () => {
  it("recomputes browsing prices, strips URL queries and rejects plaintext identity", async () => {
    expect((await relay(request(browse))).status).toBe(202);
    await flush();
    expect(mocks.send.mock.calls[0][0][0]).toMatchObject({ event_id: "checkout-123", page: { url: `${origin}/checkout` }, user: {}, properties: { value: 540, currency: "ZAR" } });
  });
  it("rejects forged purchases, cross-origin traffic, malformed items and oversized requests", async () => {
    expect((await relay(request({ ...browse, event: "Purchase" }))).status).toBe(400);
    expect((await relay(request(browse, { origin: "https://other.example" }))).status).toBe(403);
    expect((await relay(request({ ...browse, parameters: { contents: [{ content_id: "fake", quantity: 1 }] } }))).status).toBe(400);
    expect((await relay(request({ ...browse, padding: "x".repeat(17000) }))).status).toBe(413);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("reports confirmed payments from both verifier paths using the verified reference", async () => {
    expect((await verifyGet(new Request(`${origin}/api/checkout/verify?reference=paid-123`))).status).toBe(200);
    expect((await verifyPost(request({ reference: "paid-123" }))).status).toBe(200);
    await flush();
    expect(mocks.purchase).toHaveBeenCalledTimes(2);
    expect(mocks.purchase.mock.calls[0][0]).toMatchObject({ reference: "paid-123", amount: 540, client: { ttclid: "click-123" } });
  });
  it("never schedules TikTok payments for failed or mismatched transactions", async () => {
    for (const result of [{ ...verified, status: "failed" }, { ...verified, amount: 45000 }]) {
      mocks.verify.mockResolvedValue(result);
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await verifyGet(new Request(`${origin}/api/checkout/verify?reference=paid-123`))).status).toBeGreaterThanOrEqual(400);
      expect((await verifyPost(request({ reference: "paid-123" }))).status).toBeGreaterThanOrEqual(400);
    }
    expect(mocks.after).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("requires a signed webhook and never substitutes Paystack server identity for the buyer", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "webhook-test-secret");
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "paid-123", amount: 54000, currency: "ZAR", customer: { email: "buyer@example.com" }, metadata: verified.metadata } });
    const make = (signature: string) => new Request(`${origin}/api/paystack/webhook`, { method: "POST", body: raw, headers: { "x-paystack-signature": signature, "user-agent": "Paystack-server" } });
    expect((await webhook(make("invalid"))).status).toBe(401);
    expect(mocks.after).not.toHaveBeenCalled();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const signature = createHmac("sha512", "webhook-test-secret").update(raw).digest("hex");
    expect((await webhook(make(signature))).status).toBe(200);
    await flush();
    expect(mocks.purchase.mock.calls[0][0].request).toBeUndefined();
    expect(mocks.purchase.mock.calls[0][0].reference).toBe("paid-123");
    vi.unstubAllEnvs(); vi.restoreAllMocks();
  });
});
