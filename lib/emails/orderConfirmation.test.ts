import { describe, it, expect } from "vitest";
import { orderConfirmationEmail } from "./orderConfirmation";

describe("orderConfirmationEmail", () => {
  const e = orderConfirmationEmail({
    reference: "ref_123", total: "R1 044",
    items: [{ colour: "green", name: "Forest Green", qty: 2 }],
    address: { line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC", country: "South Africa" },
  });
  it("has a warm subject", () => {
    expect(e.subject).toMatch(/confirmed/i);
  });
  it("includes reference, total, item and address", () => {
    expect(e.html).toContain("ref_123");
    expect(e.html).toContain("R1 044");
    expect(e.html).toContain("Forest Green");
    expect(e.html).toContain("Cape Town");
  });
  it("returns a plain-text version", () => {
    expect(e.text).toContain("Forest Green");
    expect(e.text).not.toContain("<");
  });
});
