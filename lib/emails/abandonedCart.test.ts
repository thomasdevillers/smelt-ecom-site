import { describe, it, expect } from "vitest";
import { abandonedCartEmail } from "./abandonedCart";

describe("abandonedCartEmail", () => {
  const e = abandonedCartEmail({
    name: "Sam", items: [{ colour: "green", name: "Forest Green", qty: 1 }],
    total: "R549", cartUrl: "https://saunahat.co.za/cart",
  });
  it("has a warming-up subject", () => {
    expect(e.subject).toMatch(/warming up/i);
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
