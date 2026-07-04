import { describe, it, expect } from "vitest";
import { shippingEmail } from "./shipping";

describe("shippingEmail", () => {
  const e = shippingEmail({
    name: "Sam", carrier: "PostNet", trackingNumber: "TRK123",
    trackingUrl: "https://track.example.com/TRK123",
    items: [{ colour: "green", name: "Forest Green", qty: 1 }],
  });
  it("has an on-its-way subject", () => {
    expect(e.subject).toMatch(/on its way/i);
  });
  it("includes carrier, tracking number and track link", () => {
    expect(e.html).toContain("PostNet");
    expect(e.html).toContain("TRK123");
    expect(e.html).toContain("https://track.example.com/TRK123");
  });
  it("omits the track button when no url is given", () => {
    const e2 = shippingEmail({ carrier: "PostNet", trackingNumber: "TRK9", items: [] });
    expect(e2.html).not.toContain("Track your parcel");
    expect(e2.html).toContain("TRK9");
  });
});
