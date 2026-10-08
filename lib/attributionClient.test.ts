import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ATTRIBUTION_STORAGE_KEY, ATTRIBUTION_WINDOW_MS } from "./attribution";

let storage: Map<string, string>;
let browser: { location: { href: string }; localStorage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  storage = new Map();
  browser = { location: { href: "https://saunahat.co.za/product?utm_source=facebook&utm_medium=paid_social" }, localStorage: {
    getItem: vi.fn(key => storage.get(key) ?? null), setItem: vi.fn((key, value) => storage.set(key, value)), removeItem: vi.fn(key => storage.delete(key)),
  } };
  vi.stubGlobal("window", browser); vi.stubGlobal("document", { referrer: "https://google.com/search" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("retains the original source through internal navigation, checkout and a new direct visit", async () => {
  const client = await import("./attributionClient");
  const first = client.captureBrowserAttribution();
  browser.location.href = "https://saunahat.co.za/cart";
  expect(client.captureBrowserAttribution()).toEqual(first);
  browser.location.href = "https://saunahat.co.za/checkout";
  expect(client.getCheckoutAttribution()).toEqual(first);
  vi.resetModules(); vi.stubGlobal("document", { referrer: "" }); vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect((await import("./attributionClient")).getCheckoutAttribution()).toEqual(first);
});
it("keeps Meta attribution when an email is opened later", async () => {
  const client = await import("./attributionClient");
  client.captureBrowserAttribution();
  browser.location.href = "https://saunahat.co.za/product?utm_source=smelt&utm_medium=email&utm_campaign=newsletter";
  vi.advanceTimersByTime(1000);
  expect(client.getCheckoutAttribution()).toMatchObject({ firstTouch: { source: "facebook" }, lastTouch: { source: "facebook", medium: "paid_social" } });
});
it("does not overwrite attribution on a Paystack return", async () => {
  (await import("./attributionClient")).captureBrowserAttribution();
  const stored = storage.get(ATTRIBUTION_STORAGE_KEY);
  vi.resetModules(); browser.location.href = "https://saunahat.co.za/checkout/success?reference=private";
  vi.stubGlobal("document", { referrer: "https://checkout.paystack.com/private" });
  (await import("./attributionClient")).captureBrowserAttribution();
  expect(storage.get(ATTRIBUTION_STORAGE_KEY)).toBe(stored);
});
it("supports corrupt or blocked storage without throwing during checkout", async () => {
  storage.set(ATTRIBUTION_STORAGE_KEY, "invalid-json");
  browser.localStorage.getItem.mockImplementation(() => { throw new Error("blocked"); });
  browser.localStorage.setItem.mockImplementation(() => { throw new Error("blocked"); });
  const client = await import("./attributionClient");
  client.captureBrowserAttribution();
  browser.location.href = "https://saunahat.co.za/checkout";
  expect(client.getCheckoutAttribution()?.lastTouch.source).toBe("facebook");
});
it("starts a fresh direct record when an earlier campaign is expired", async () => {
  (await import("./attributionClient")).captureBrowserAttribution();
  vi.advanceTimersByTime(ATTRIBUTION_WINDOW_MS); vi.resetModules();
  browser.location.href = "https://saunahat.co.za/product"; vi.stubGlobal("document", { referrer: "" });
  expect((await import("./attributionClient")).captureBrowserAttribution()).toMatchObject({ firstTouch: { source: "direct" }, lastTouch: { source: "direct" } });
});
