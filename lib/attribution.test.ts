import { describe, expect, it } from "vitest";
import { activeAttribution, ATTRIBUTION_WINDOW_MS, attributionChannel, attributionLabel, captureTouch, mergeAttribution, parseAttribution } from "./attribution";

const now = Date.parse("2026-10-06T10:00:00Z");
const visit = (query = "", referrer = "", time = now, path = "/product") => captureTouch(new URL(`https://saunahat.co.za${path}${query}`), referrer, time)!;

describe("order attribution", () => {
  it("needs only the Meta tag and groups all other recorded visits as Organic", () => {
    expect(attributionLabel(visit("?utm_source=meta"))).toBe("Meta");
    expect(attributionLabel(visit("", "https://google.com/search"))).toBe("Organic");
    expect(attributionLabel(visit())).toBe("Organic");
    expect(attributionLabel(visit("?utm_source=instagram&utm_medium=social"))).toBe("Organic");
    expect(attributionLabel(null)).toBe("Not recorded");
  });
  it("preserves the Meta visit through later organic/email visits without extending the window", () => {
    const initial = mergeAttribution(null, visit("?utm_source=meta"), now)!;
    const later = now + ATTRIBUTION_WINDOW_MS - 1000;
    const retained = mergeAttribution(initial, visit("?utm_source=smelt&utm_medium=email", "", later), later)!;
    expect(retained.lastTouch).toEqual(initial.lastTouch);
    const expiredAt = now + ATTRIBUTION_WINDOW_MS;
    const fresh = mergeAttribution(retained, visit("", "https://google.com/search", expiredAt), expiredAt);
    expect(attributionLabel(fresh?.lastTouch)).toBe("Organic");
  });
  it("prioritizes paid campaign tags over referrers and normalizes Meta placements", () => {
    const touch = visit("?utm_source=ig&utm_medium=paid_social&utm_campaign=october&utm_content=video&utm_id=123", "https://l.facebook.com/link?private=1");
    expect(touch).toMatchObject({ source: "instagram", medium: "paid_social", campaign: "october", content: "video", campaignId: "123", referrerHost: "l.facebook.com", landingPath: "/product" });
    expect(attributionChannel(touch)).toBe("meta");
    expect(attributionLabel(touch)).toBe("Meta");
  });
  it.each([
    ["https://www.google.co.za/search?q=hats", "google", "organic"],
    ["https://www.google.co.uk/search?q=hats", "google", "organic"],
    ["https://www.bing.com/search?q=hats", "bing", "organic"],
    ["https://l.facebook.com/redirect", "facebook", "organic"],
    ["https://l.instagram.com/redirect", "instagram", "organic"],
    ["https://saunaclub.example/hats", "saunaclub.example", "organic"],
    ["", "direct", "organic"],
  ])("classifies %s without retaining the referrer's private URL", (referrer, source, channel) => {
    const touch = visit("", referrer);
    expect(touch.source).toBe(source);
    expect(attributionChannel(touch)).toBe(channel);
    expect(JSON.stringify(touch)).not.toContain("q=hats");
  });
  it("does not claim an untagged Facebook click came from a paid ad", () => {
    const touch = visit("?fbclid=private-click-id");
    expect(attributionChannel(touch)).toBe("organic");
    expect(JSON.stringify(touch)).not.toContain("private-click-id");
    expect(attributionChannel(visit("?gclid=private-google-id"))).toBe("organic");
    expect(attributionChannel(visit("?utm_source=instagram&utm_medium=social"))).toBe("organic");
  });
  it("preserves first touch and last marketing touch across direct returns and internal browsing", () => {
    const first = visit("", "https://google.com/search", now - 1000);
    const paid = visit("?utm_source=facebook&utm_medium=paid_social");
    const attribution = mergeAttribution(mergeAttribution(null, first, now), paid, now);
    expect(mergeAttribution(attribution, visit("", "https://saunahat.co.za/product", now + 1000), now + 1000)).toEqual(attribution);
    expect(attribution).toMatchObject({ firstTouch: { source: "google" }, lastTouch: { source: "facebook" } });
    expect(mergeAttribution(attribution, visit("?utm_source=smelt&utm_medium=email", "", now + 2000), now + 2000)?.lastTouch.source).toBe("facebook");
  });
  it("expires each browser touch after 30 days without extending an old campaign on direct returns", () => {
    const attribution = mergeAttribution(null, visit("?utm_source=facebook&utm_medium=paid_social"), now);
    expect(activeAttribution(attribution, now + ATTRIBUTION_WINDOW_MS)).toBeNull();
    expect(parseAttribution(attribution)).toEqual(attribution); // historical orders remain readable
    const refreshed = mergeAttribution(attribution, visit("", "", now + ATTRIBUTION_WINDOW_MS), now + ATTRIBUTION_WINDOW_MS);
    expect(refreshed?.lastTouch.source).toBe("direct");
    const recent = mergeAttribution(attribution, visit("?utm_source=meta", "", now + 1000), now + 1000);
    expect(activeAttribution(recent, now + ATTRIBUTION_WINDOW_MS)?.firstTouch.source).toBe("meta");
  });
  it("ignores payment-return sources and excludes admin, API and unsubscribe entry points", () => {
    for (const path of ["/admin", "/api/checkout", "/checkout/success", "/email/unsubscribe/secret"]) {
      expect(captureTouch(new URL(`https://saunahat.co.za${path}?utm_source=paystack`), "", now)).toBeNull();
    }
    expect(visit("", "https://checkout.paystack.com/test").source).toBe("direct");
    expect(visit("", "https://www.saunahat.co.za/cart").source).toBe("direct");
  });
  it("stores only a route name for private recovery links and allowlisted metadata", () => {
    const touch = visit("?utm_source=smelt&utm_medium=email&email=private@example.com", "", now, "/checkout/recover/private-token");
    const attribution = mergeAttribution(null, touch, now)!;
    const parsed = parseAttribution({ ...attribution, secret: "private", lastTouch: { ...touch, phone: "private", landingPath: "/checkout/offer/private-code?email=private" } });
    expect(parsed?.lastTouch.landingPath).toBe("/checkout/offer");
    expect(parseAttribution(parsed)).toEqual(parsed);
    expect(JSON.stringify(parsed)).not.toContain("private");
  });
  it("rejects malformed, future and out-of-order attribution and bounds campaign values", () => {
    expect(parseAttribution({ version: 1, firstTouch: null, lastTouch: {} })).toBeNull();
    const touch = visit("?utm_source=facebook&utm_medium=paid_social");
    expect(parseAttribution({ version: 1, firstTouch: { ...touch, capturedAt: new Date(now + 1000).toISOString() }, lastTouch: touch })).toBeNull();
    expect(activeAttribution({ version: 1, firstTouch: { ...touch, capturedAt: "2027-01-01" }, lastTouch: { ...touch, capturedAt: "2027-01-01" } }, now)).toBeNull();
    expect(parseAttribution({ version: 1, firstTouch: touch, lastTouch: { ...touch, campaign: "a".repeat(1000) } })?.lastTouch.campaign).toHaveLength(160);
    expect(attributionLabel(null)).toBe("Not recorded");
  });
});
