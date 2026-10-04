import { describe, expect, it } from "vitest";
import { PRICING_VERSION } from "./pricing";
import { checkoutTotal, discountedCheckoutTotal, paidCheckoutTotal, sanitizeCart } from "./checkoutShared";

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
    expect(checkoutTotal({ green: 2, cream: 1 })).toBe(1250);
  });

  it("uses sanitized quantities when recomputing an untrusted cart", () => {
    expect(checkoutTotal(sanitizeCart({ green: "1", cream: -10 }))).toBe(540);
  });

  it("subtracts only a safe server-validated voucher amount", () => {
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", 50)).toBe(490);
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", -50)).toBeNaN();
    expect(discountedCheckoutTotal({ green: 1, cream: 0 }, "aramex", 540)).toBeNaN();
  });
  it.each([3, 4])("charges the %i-hat bundle for every possible colour mix", qty => {
    const total = qty === 3 ? 1250 : 1600;
    for (let green = 0; green <= qty; green++) {
      const cart = { green, cream: qty - green };
      expect(checkoutTotal(cart)).toBe(total);
      expect(paidCheckoutTotal(cart, "aramex", 0, 450, PRICING_VERSION)).toBe(total);
      expect(discountedCheckoutTotal(cart, "aramex", 50)).toBe(total - 50);
      expect(paidCheckoutTotal(cart, "aramex", 50, 450, PRICING_VERSION)).toBe(total - 50);
    }
  });

  it("preserves full-price older payments and rejects unknown pricing versions", () => {
    const cart = { green: 2, cream: 1 };
    expect(paidCheckoutTotal(cart, "aramex")).toBe(1350);
    expect(paidCheckoutTotal(cart, "aramex", 0, 550)).toBe(1650);
    expect(paidCheckoutTotal(cart, "aramex", 0, 550, PRICING_VERSION)).toBe(1250);
    for (const version of [null, "unknown", {}, 1]) {
      expect(paidCheckoutTotal(cart, "aramex", 0, 450, version)).toBeNaN();
    }
    expect(paidCheckoutTotal(cart, "aramex", 0, 1, PRICING_VERSION)).toBeNaN();
  });

});
