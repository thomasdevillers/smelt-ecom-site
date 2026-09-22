import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/tiktokEvents", () => ({ tiktokUser: () => ({}) }));
vi.mock("@/lib/paystack", () => ({
  isPaystackConfigured: () => true,
  PaystackInitializationRejected: class extends Error {},
  initializeTransaction: vi.fn().mockResolvedValue({ authorizationUrl: "https://checkout.paystack.com/test", reference: "test" }),
}));
vi.mock("@/lib/inventory", () => ({
  createInventoryReservationId: () => "smelt-00000000-0000-4000-8000-000000000000",


}));
vi.mock("@/lib/vouchers", () => ({
  reserveVoucher: vi.fn().mockResolvedValue({ id: "a".repeat(64), amount: 50 }),
  releaseVoucherReservation: vi.fn(),
  releaseVoucherCodeReservation: vi.fn(),
}));
import { POST } from "@/app/api/checkout/route";
import { initializeTransaction } from "@/lib/paystack";
import { reserveVoucher } from "@/lib/vouchers";
vi.mock("@/lib/preorderStore", () => ({
  releaseRejectedPurchase: vi.fn(),
  reservePurchase: vi.fn().mockResolvedValue({ reserved: true }),
  getAvailability: vi.fn().mockResolvedValue({ green: 0, cream: 13, preorder: { green: 0, cream: 0 } }),
}));
import { reservePurchase } from "@/lib/preorderStore";
const request = (address: unknown, extra: Record<string, unknown> = {}) => new Request("https://saunahat.co.za/api/checkout", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://saunahat.co.za" },
  body: JSON.stringify({ email: "buyer@example.com", cart: { green: 1 }, address, shippingMethod: "aramex", ...extra }),
});
beforeEach(() => vi.clearAllMocks());
it("rejects missing or whitespace-only phone numbers before creating a payment", async () => {
  for (const phone of [undefined, "", "   "]) {
    expect((await POST(request({ phone }))).status).toBe(400);
  }
  expect(initializeTransaction).not.toHaveBeenCalled();
});
it("keeps the phone and optional company/estate name in Paystack shipping metadata", async () => {
  expect((await POST(request({ phone: " 0837875826 ", company: " Oak Estate " }))).status).toBe(200);
  expect(initializeTransaction).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({ shippingAddress: expect.objectContaining({ phone: "0837875826", company: "Oak Estate" }) }),
  }));
  expect((await POST(request({ phone: "0837875826" }))).status).toBe(200);
});
it("refuses checkout before Paystack when the requested colour is unavailable", async () => {
  vi.mocked(reservePurchase).mockResolvedValueOnce({ reserved: false });
  const response = await POST(request({ phone: "0837875826" }));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("Availability has changed");
  expect(initializeTransaction).not.toHaveBeenCalled();
});
it("reserves a personal review voucher and sends only the discounted amount to Paystack", async () => {
  const response = await POST(request({ phone: "0837875826" }, { voucherCode: "SMELT-ABCDEFGHIJKL" }));
  expect(response.status).toBe(200);
  expect(reserveVoucher).toHaveBeenCalledWith("SMELT-ABCDEFGHIJKL", "buyer@example.com", "smeltp-00000000-0000-4000-8000-000000000000");
  expect(initializeTransaction).toHaveBeenCalledWith(expect.objectContaining({
    amount: 490,
    metadata: expect.objectContaining({ voucher: { id: "a".repeat(64), amount: 50 } }),
  }));
});
it("rejects cross-origin attempts before holding stock", async () => {
  const response = await POST(new Request("https://saunahat.co.za/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.example" }, body: "{}",
  }));
  expect(response.status).toBe(403);
  expect(reservePurchase).not.toHaveBeenCalled();
});
