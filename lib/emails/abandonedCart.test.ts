import { describe, it, expect } from "vitest";
import { abandonedCartEmail } from "./abandonedCart";

describe("abandonedCartEmail", () => {
  const e = abandonedCartEmail({
    name: "Sam", items: [{ colour: "green", name: "Forest Green", qty: 1 }],
    total: "R550", cartUrl: "https://saunahat.co.za/cart",
  });
  it("uses normal sales copy after restocking", () => {
    expect(e.subject).not.toMatch(/pre-order/i);
    for (const content of [e.html, e.text]) {
      expect(content).not.toContain("Pre-orders ship");
      expect(content).not.toContain("15 October");
    }
  });
  it("greets by name, links to cart, and offers an opt-out", () => {
    expect(e.html).toContain("Sam");
    expect(e.html).toContain("https://saunahat.co.za/cart");
    expect(e.html.toLowerCase()).toContain("reply to this email");
  });
  it("works without a name", () => {
    const e2 = abandonedCartEmail({ items: [], total: "R0", cartUrl: "https://x.co/cart" });
    expect(e2.html).toContain("Hi there,");
  });
});
