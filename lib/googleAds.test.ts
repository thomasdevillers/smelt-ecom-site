import { afterEach, beforeEach, expect, it, vi } from "vitest";

const paid = { paid: true, reference: "verified-1", amountRand: 1250, currency: "ZAR" };
let trackPurchase: typeof import("./googleAds").trackGoogleAdsPurchase;
let browser: EventTarget & { gtag?: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  vi.resetModules();
  browser = Object.assign(new EventTarget(), { gtag: vi.fn() });
  vi.stubGlobal("window", browser);
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  trackPurchase = (await import("./googleAds")).trackGoogleAdsPurchase;
});

afterEach(() => vi.unstubAllGlobals());

it("sends the verified order value and transaction ID to the supplied conversion", () => {
  trackPurchase(paid);
  expect(browser.gtag).toHaveBeenCalledExactlyOnceWith("event", "conversion", {
    send_to: "AW-18503032708/soqaCOy2w5YdEIS_9_ZE",
    value: 1250,
    currency: "ZAR",
    transaction_id: "verified-1",
  });
});

it("ignores unpaid, invalid, or incomplete verifier responses", () => {
  for (const input of [
    { ...paid, paid: false },
    { ...paid, paid: undefined },
    { ...paid, reference: "" },
    { ...paid, reference: " " },
    { ...paid, amountRand: 0 },
    { ...paid, amountRand: -1 },
    { ...paid, amountRand: NaN },
    { ...paid, amountRand: Infinity },
    { ...paid, currency: "USD" },
  ]) trackPurchase(input);
  expect(browser.gtag).not.toHaveBeenCalled();
});

it("suppresses repeats, including after a page reload, while allowing another order", async () => {
  trackPurchase(paid);
  trackPurchase(paid);
  vi.resetModules();
  const reloaded = await import("./googleAds");
  reloaded.trackGoogleAdsPurchase(paid);
  expect(browser.gtag).toHaveBeenCalledTimes(1);
  reloaded.trackGoogleAdsPurchase({ ...paid, reference: "verified-2" });
  expect(browser.gtag).toHaveBeenCalledTimes(2);
});

it("waits for tag initialization and sends once even if verification repeats", () => {
  delete browser.gtag;
  trackPurchase(paid);
  trackPurchase(paid);
  browser.gtag = vi.fn();
  expect(browser.gtag).not.toHaveBeenCalled();
  browser.dispatchEvent(new Event("google-ads-ready"));
  browser.dispatchEvent(new Event("google-ads-ready"));
  expect(browser.gtag).toHaveBeenCalledTimes(1);
});

it("tolerates blocked storage and tracking errors without breaking confirmation", () => {
  vi.stubGlobal("sessionStorage", {
    getItem: () => { throw Error("denied"); },
    setItem: () => { throw Error("denied"); },
  });
  browser.gtag!.mockImplementationOnce(() => { throw Error("blocked"); });
  expect(() => trackPurchase(paid)).not.toThrow();
  trackPurchase(paid);
  trackPurchase(paid);
  expect(browser.gtag).toHaveBeenCalledTimes(2);
});

it("does nothing during server rendering", () => {
  vi.stubGlobal("window", undefined);
  expect(() => trackPurchase(paid)).not.toThrow();
  expect(browser.gtag).not.toHaveBeenCalled();
});
