import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
import { track } from "@vercel/analytics";
import { trackVercelEvent, trackVercelPurchase, vercelCartData, vercelProductData } from "./vercelAnalytics";
const paid = { paid: true, reference: "verified-1", amountRand: 540, currency: "ZAR", items: [{ colour: "green", qty: 1 }] };
beforeEach(() => {
  vi.mocked(track).mockReset();
  vi.stubGlobal("window", {});
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());
it("stays within the two custom properties available on Vercel Pro", () => {
  expect(vercelProductData("cream", 2)).toEqual({ colour: "cream", quantity: 2 });
  expect(vercelCartData({ green: 1, cream: 1 })).toEqual({ colour: "mixed", quantity: 2 });
});
it("tracks checkout diagnostic stages without customer or payment data", () => {
  const properties = vercelCartData({ green: 1, cream: 1 });
  trackVercelEvent("PaymentOpened", properties);
  trackVercelEvent("PaymentCancelled", properties);
  trackVercelEvent("CheckoutError", properties);
  expect(track).toHaveBeenNthCalledWith(1, "PaymentOpened", { colour: "mixed", quantity: 2 });
  expect(track).toHaveBeenNthCalledWith(2, "PaymentCancelled", { colour: "mixed", quantity: 2 });
  expect(track).toHaveBeenNthCalledWith(3, "CheckoutError", { colour: "mixed", quantity: 2 });
});
it("only counts confirmed payments once and sends no payment reference or customer data", async () => {
  trackVercelPurchase({ ...paid, paid: false });
  trackVercelPurchase({ ...paid, amountRand: 0 });
  trackVercelPurchase({ ...paid, currency: "USD" });
  expect(track).not.toHaveBeenCalled();
  trackVercelPurchase(paid);
  trackVercelPurchase(paid);
  expect(track).toHaveBeenCalledExactlyOnceWith("Purchase", { colour: "green", quantity: 1 });
  vi.resetModules();
  const reloaded = await import("./vercelAnalytics");
  reloaded.trackVercelPurchase(paid);
  expect(track).toHaveBeenCalledTimes(1);
});
it("handles unavailable storage and retries after a tracking exception", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
  vi.mocked(track).mockImplementationOnce(() => { throw Error("blocked"); });
  const input = { ...paid, reference: "verified-2" };
  expect(() => trackVercelPurchase(input)).not.toThrow();
  trackVercelPurchase(input);
  trackVercelPurchase(input);
  expect(track).toHaveBeenCalledTimes(2);
});
