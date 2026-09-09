import { describe, it, expect, afterEach, vi } from "vitest";
import { shippingEmail } from "./shipping";

afterEach(() => vi.unstubAllEnvs());

describe("shippingEmail", () => {
  it("renders an Aramex shipment with only a tracking number", () => {
    vi.stubEnv("SITE_URL", "");
    const e = shippingEmail({ trackingNumber: " WAY 123&4 " });
    const url = "https://aramex.co.za/tracking/TrackShipment.php?waybill=WAY%20123%264";
    expect(e.subject).toBe("Your Smelt order is on the move 📦");
    expect(e.html).toContain("Aramex");
    expect(e.html).toContain(url);
    expect(e.text).toContain(url);
    expect(e.html).toContain('href="https://saunahat.co.za/care"');
    expect(e.text).toContain("https://saunahat.co.za/care");
    expect(e.html).not.toContain("no line items recorded");
    expect(e.html).toContain("Tom &amp; Marc");
  });

  it("supports names, order items and a configured care-guide origin", () => {
    vi.stubEnv("SITE_URL", "https://shop.example.com/");
    const e = shippingEmail({ name: "Sam <Smith>", trackingNumber: "123", items: [{ colour: "green", name: "Forest Green", qty: 1 }] });
    expect(e.html).toContain("Hi Sam &lt;Smith&gt;,");
    expect(e.html).toContain("Forest Green");
    expect(e.html).toContain("https://shop.example.com/care");
    expect(e.text).toContain("https://shop.example.com/care");
  });

  it("preserves custom carrier links safely in HTML and plain text", () => {
    const url = 'https://track.example.com/?id=123&note="hello"';
    const e = shippingEmail({ carrier: "PostNet", trackingNumber: "TRK123", trackingUrl: url });
    expect(e.html).toContain("PostNet");
    expect(e.html).toContain('href="https://track.example.com/?id=123&amp;note=&quot;hello&quot;"');
    expect(e.text).toContain(`Track my order: ${url}`);
    const noLink = shippingEmail({ carrier: "PostNet", trackingNumber: "TRK9" });
    expect(noLink.html).not.toContain("Track my order");
  });

  it("rejects missing tracking numbers and unsafe tracking URLs", () => {
    expect(() => shippingEmail({ trackingNumber: " " })).toThrow("tracking number");
    expect(() => shippingEmail({ trackingNumber: "123", trackingUrl: "javascript:alert(1)" })).toThrow("HTTP or HTTPS");
  });
});
