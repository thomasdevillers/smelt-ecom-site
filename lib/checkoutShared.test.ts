import { describe, expect, it } from "vitest";
import { checkoutTotal, discountedCheckoutTotal, sanitizeCart } from "./checkoutShared";

describe("checkoutTotal", () => {
  it("charges full founder delivery for single and multiple hats", () => {
    expect(checkoutTotal({ green: 1, cream: 0 }, "founders")).toBe(5450);
    expect(checkoutTotal({ green: 1, cream: 1 }, "founders")).toBe(5900);
    expect(checkoutTotal({ green: 0, cream: 0 }, "founders")).toBe(0);
  });

  it("rejects unknown shipping methods instead of accepting a cheaper default", () => {
    for (const method of ["free", "", null, { price: 0 }]) {
      expect(checkoutTotal({ green: 1, cream: 0 }, method)).toBeNaN();
    }
  });

  it("does not add shipping to an empty cart", () => {
    expect(checkoutTotal({ green: 0, cream: 0 })).toBe(0);
  });

  it("includes shipping below the free-shipping threshold", () => {
    expect(checkoutTotal({ green: 1, cream: 0 })).toBe(540);
  });

  it("does not add shipping once the cart qualifies for free shipping", () => {
    expect(checkoutTotal({ green: 2, cream: 0 })).toBe(900);
  });

  it("charges the same total for matching and mixed colours", () => {
    expect(checkoutTotal({ green: 1, cream: 1 })).toBe(900);
    expect(checkoutTotal({ green: 0, cream: 2 })).toBe(900);
    expect(checkoutTotal({ green: 2, cream: 1 })).toBe(1350);
  });

  it("uses sanitized quantities when recomputing an untrusted cart", () => {
    expect(checkoutTotal(sanitizeCart({ green: "1", cream: -10 }))).toBe(540);
  });

  it("subtracts only a safe server-validated voucher amount", () => {
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", 50)).toBe(490);
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", -50)).toBeNaN();
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", 540)).toBeNaN();
  });
});
