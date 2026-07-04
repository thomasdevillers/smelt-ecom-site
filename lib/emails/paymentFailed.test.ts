import { describe, it, expect } from "vitest";
import { paymentFailedEmail } from "./paymentFailed";

describe("paymentFailedEmail", () => {
  const e = paymentFailedEmail({ retryUrl: "https://saunahat.co.za/checkout" });
  it("has a reassuring subject", () => {
    expect(e.subject).toMatch(/didn.t go through/i);
  });
  it("links back to checkout", () => {
    expect(e.html).toContain("https://saunahat.co.za/checkout");
  });
});
