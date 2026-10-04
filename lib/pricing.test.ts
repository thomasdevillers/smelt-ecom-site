import { describe, it, expect } from "vitest";
import {
  bundleSubtotal,
  bundleDiscount,
  bundleDeliveredSaving,
  BASE_PRICE,
  SHIPPING_FEE,
  FREE_SHIP_THRESHOLD,
  unitPrice,
  lineTotal,
  formatMoney,
  qualifiesForFreeShipping,
  shippingFee,
  grandTotal,
  SHIPPING_OPTIONS,
} from "./pricing";

describe("pricing", () => {
  it("has the updated base price and shipping constants", () => {
    expect(BASE_PRICE).toBe(450);
    expect(SHIPPING_FEE).toBe(90);
    expect(FREE_SHIP_THRESHOLD).toBe(500);
  });

  it.each([1, 2, 3, 4, 10])("charges R450 per hat at quantity %i", (qty) => {
    expect(unitPrice()).toBe(450);
    expect(lineTotal(qty)).toBe(450 * qty);
  });

  it.each([[3, 1250, 100, 190], [4, 1600, 200, 290]])("prices a %i-hat pack and separates item savings from delivery", (qty, total, discount, saving) => {
    expect(bundleSubtotal(qty)).toBe(total);
    expect(bundleDiscount(qty)).toBe(discount);
    expect(bundleDeliveredSaving(qty)).toBe(saving);
    expect(grandTotal(total)).toBe(total);
  });

  it.each([[0, 0], [1, 450], [2, 900], [5, 2050], [6, 2500], [7, 2850], [8, 3200], [11, 4450]])("combines packs and single hats at quantity %i", (qty, total) => {
    expect(bundleSubtotal(qty)).toBe(total);
  });

  it("formats money with a space thousands separator", () => {
    expect(formatMoney(450)).toBe("R450");
    expect(formatMoney(1578)).toBe("R1 578");
    expect(formatMoney(0)).toBe("R0");
  });

  it("calculates free shipping for orders at or above threshold", () => {
    expect(qualifiesForFreeShipping(450)).toBe(false);
    expect(qualifiesForFreeShipping(500)).toBe(true);
    expect(shippingFee(450)).toBe(90);
    expect(shippingFee(500)).toBe(0);
    expect(grandTotal(450)).toBe(540);
    expect(grandTotal(500)).toBe(500);
  });

  it("quotes dispatch and transit honestly instead of promising overnight delivery", () => {
    expect(SHIPPING_OPTIONS.aramex.description).toContain("Dispatched in 1–3 business days");
    expect(SHIPPING_OPTIONS.aramex.description).toContain("3–5");
    expect(SHIPPING_OPTIONS.aramex.description.toLowerCase()).not.toContain("overnight");
  });
});
