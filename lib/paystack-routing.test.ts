import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "../app/api/checkout/verify/route";

const mocks = vi.hoisted(() => ({ queue: vi.fn(), inventory: vi.fn(), voucher: vi.fn(), notify: vi.fn(), meta: vi.fn(), after: vi.fn(), fetch: vi.fn() }));
vi.mock("./paystackEventWorker", () => ({ persistVerifiedPayment: mocks.queue }));
vi.mock("./inventory", () => ({ commitInventory: mocks.inventory }));
vi.mock("./vouchers", async importOriginal => ({ ...await importOriginal<typeof import("./vouchers")>(), commitVoucher: mocks.voucher }));
vi.mock("./orderConfirmation", () => ({ tryOrderConfirmation: mocks.notify }));
vi.mock("./metaConversions", () => ({ sendMetaPurchase: mocks.meta }));
vi.mock("./purchaseStore", () => ({ resolvePurchasePreorder: async () => undefined }));
vi.mock("next/server", () => ({ after: mocks.after }));
const data = { id: 123, domain: "test", reference: "smeltp-synthetic", status: "success", amount: 54000, currency: "ZAR", paid_at: "2026-11-21T12:00:00Z",
  customer: { email: "synthetic@example.invalid" }, metadata: { cart: { green: 1 }, unitPrice: 450, inventoryReservation: "smeltp-synthetic" } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_synthetic"); vi.stubEnv("PAYSTACK_EVENT_STORE", "postgres");
  vi.stubEnv("PAYSTACK_EVENT_PAUSED", "false"); vi.stubEnv("VERCEL_ENV", ""); vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ status: true, data })); mocks.queue.mockResolvedValue("event");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("shared callback/payment worker ownership", () => {
  it("queues both callback variants durably and avoids independent financial/email effects", async () => {
    const post = await POST(new Request("https://synthetic.invalid/api/checkout/verify", { method: "POST", body: JSON.stringify({ reference: data.reference }) }));
    const get = await GET(new Request(`https://synthetic.invalid/api/checkout/verify?reference=${data.reference}`));
    expect(post.status).toBe(200); expect(get.status).toBe(200); expect(mocks.queue).toHaveBeenCalledTimes(2);
    expect(mocks.inventory).not.toHaveBeenCalled(); expect(mocks.voucher).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.meta).not.toHaveBeenCalled();
  });
  it("does not report callback success when durable enqueue failed", async () => {
    mocks.queue.mockRejectedValue(new Error("queue unavailable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect((await GET(new Request(`https://synthetic.invalid/api/checkout/verify?reference=${data.reference}`))).status).toBe(502); }
    finally { consoleSpy.mockRestore(); }
    expect(mocks.inventory).not.toHaveBeenCalled();
  });
  it("continues accepting verified callback records during a worker pause", async () => {
    vi.stubEnv("PAYSTACK_EVENT_PAUSED", "true");
    expect((await GET(new Request(`https://synthetic.invalid/api/checkout/verify?reference=${data.reference}`))).status).toBe(200);
    expect(mocks.queue).toHaveBeenCalledOnce(); expect(mocks.notify).not.toHaveBeenCalled();
  });
});
