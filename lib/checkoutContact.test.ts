import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/tiktokEvents", () => ({ tiktokUser: () => ({}) }));
vi.mock("@/lib/paystack", () => ({
  isPaystackConfigured: () => true,
  initializeTransaction: vi.fn().mockResolvedValue({ authorizationUrl: "https://checkout.paystack.com/test", reference: "test" }),
}));
import { POST } from "@/app/api/checkout/route";
import { initializeTransaction } from "@/lib/paystack";
const request = (address: unknown) => new Request("https://saunahat.co.za/api/checkout", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "buyer@example.com", cart: { green: 1 }, address }),
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
