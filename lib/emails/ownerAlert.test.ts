import { describe, it, expect } from "vitest";
import { ownerAlertEmail } from "./ownerAlert";

describe("ownerAlertEmail", () => {
  const e = ownerAlertEmail({
    reference: "ref_9", email: "buyer@example.com", total: "R549",
    items: [{ colour: "cream", name: "Natural Cream", qty: 1 }],
  });
  it("subject carries total and reference", () => {
    expect(e.subject).toContain("R549");
    expect(e.subject).toContain("ref_9");
  });
  it("body includes the customer email", () => {
    expect(e.html).toContain("buyer@example.com");
  });
});
