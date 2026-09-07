import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { hashTikTokIdentity, normalizeTikTokPhone } from "./tiktokPixel";
import { tiktokCartParameters } from "./tiktok";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(() => vi.unstubAllGlobals());

describe("TikTok matching and commerce", () => {
  it("normalizes and hashes real identifiers without plaintext or invented IDs", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(await hashTikTokIdentity({ email: " Buyer@Example.com ", phone: "082 123 4567" })).toEqual({
      email: hash("buyer@example.com"), phone_number: hash("+27821234567"),
    });
    expect(await hashTikTokIdentity({ externalId: " customer-123 " })).toEqual({ external_id: hash("customer-123") });
    expect(normalizeTikTokPhone("0027 82 123 4567")).toBe("+27821234567");
    expect(normalizeTikTokPhone("invalid")).toBeUndefined();
  });

  it("omits identifiers when hashing is unavailable or fails", async () => {
    vi.stubGlobal("crypto", {});
    expect(await hashTikTokIdentity({ email: "buyer@example.com" })).toEqual({});
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockRejectedValue(new Error("denied")) } });
    expect(await hashTikTokIdentity({ email: "buyer@example.com" })).toEqual({});
  });

  it("uses variant quantities, bundle prices and the supplied shipping-inclusive total", () => {
    expect(tiktokCartParameters({ green: 2, cream: 0 }, 856)).toEqual({
      currency: "ZAR", value: 856,
      contents: [{ content_id: "smelt-sauna-hat-green", content_type: "product", content_name: "Smelt Sauna Hat - Forest Green", quantity: 2, price: 428 }],
    });
  });

  it("waits for bootstrap, identifies before tracking and deduplicates confirmed transactions", async () => {
    vi.resetModules();
    const target = new EventTarget() as EventTarget & { ttq?: unknown };
    vi.stubGlobal("window", target);
    vi.stubGlobal("crypto", webcrypto);
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
    const { identifyTikTok, trackTikTokEvent } = await import("./tiktokPixel");
    identifyTikTok({ email: "Buyer@Example.com" });
    const listener = vi.spyOn(target, "addEventListener");
    trackTikTokEvent("Purchase", { value: 540, currency: "ZAR" }, "verified-123");
    trackTikTokEvent("Purchase", { value: 540, currency: "ZAR" }, "verified-123");
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    const identify = vi.fn(); const track = vi.fn();
    target.ttq = { identify, track };
    target.dispatchEvent(new Event("tiktok-pixel-ready"));
    expect(identify).toHaveBeenCalledWith({ email: hash("buyer@example.com") });
    expect(track).toHaveBeenCalledWith("Purchase", { value: 540, currency: "ZAR" }, { event_id: "verified-123" });
    expect(track).toHaveBeenCalledTimes(1);
    expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0]);
    // A new module (page reload) still respects session deduplication.
    vi.resetModules();
    const reloaded = await import("./tiktokPixel");
    reloaded.trackTikTokEvent("Purchase", {}, "verified-123");
    await Promise.resolve();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("relays browsing events even before the pixel loads, sharing the exact event ID", async () => {
    vi.resetModules();
    const target = new EventTarget() as EventTarget & { ttq?: unknown; location?: unknown };
    target.location = { origin: "https://saunahat.co.za", pathname: "/product", search: "?ttclid=click-123" };
    vi.stubGlobal("window", target);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("document", { cookie: "_ttp=browser-123" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(), setItem: vi.fn() });
    const relay = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", relay);
    const { trackTikTokEvent } = await import("./tiktokPixel");
    trackTikTokEvent("ViewContent", { currency: "ZAR", value: 450 });
    await Promise.resolve();
    expect(relay).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(relay.mock.calls[0][1].body);
    expect(payload.user).toMatchObject({ ttclid: "click-123", ttp: "browser-123" });
    expect(payload.url).toBe("https://saunahat.co.za/product");
    const track = vi.fn(); target.ttq = { track };
    target.dispatchEvent(new Event("tiktok-pixel-ready"));
    expect(track).toHaveBeenCalledWith("ViewContent", { currency: "ZAR", value: 450 }, { event_id: payload.event_id });
    expect(payload.event_id).toBeTruthy();
  });

  it("still tracks when storage is denied and safely absorbs pixel errors", async () => {
    vi.resetModules();
    const track = vi.fn();
    vi.stubGlobal("window", { ttq: { track, identify: vi.fn() } });
    vi.stubGlobal("sessionStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
    const { trackTikTokEvent } = await import("./tiktokPixel");
    trackTikTokEvent("Purchase", {}, "verified-456");
    trackTikTokEvent("Purchase", {}, "verified-456");
    await Promise.resolve();
    expect(track).toHaveBeenCalledTimes(1);
    track.mockImplementation(() => { throw Error("blocked"); });
    trackTikTokEvent("AddToCart", {});
    await Promise.resolve();
  });
});
