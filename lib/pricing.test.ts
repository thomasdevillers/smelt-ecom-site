import { describe, it, expect } from "vitest";
import {
  bundleSubtotal,
  bundleDiscount,
  bundleDeliveredSaving,
  BASE_PRICE,
  SHIPPING_FEE,
  FREE_SHIP_MIN_HATS,
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
    expect(BASE_PRICE).toBe(550);
    expect(SHIPPING_FEE).toBe(90);
    expect(FREE_SHIP_MIN_HATS).toBe(2);
  });

  it.each([1, 2, 3, 4, 10])("charges R550 per hat at quantity %i", (qty) => {
    expect(unitPrice()).toBe(550);
    expect(lineTotal(qty)).toBe(550 * qty);
  });

  it.each([[3, 1550, 100, 190], [4, 2000, 200, 290]])("prices a %i-hat pack and separates item savings from delivery", (qty, total, discount, saving) => {
    expect(bundleSubtotal(qty)).toBe(total);
    expect(bundleDiscount(qty)).toBe(discount);
    expect(bundleDeliveredSaving(qty)).toBe(saving);
    expect(grandTotal(total, qty)).toBe(total);
  });

  it.each([[0, 0], [1, 550], [2, 1100], [5, 2550], [6, 3100], [7, 3550], [8, 4000], [11, 5550]])("combines packs and single hats at quantity %i", (qty, total) => {
    expect(bundleSubtotal(qty)).toBe(total);
  });

  it("formats money with a space thousands separator", () => {
    expect(formatMoney(450)).toBe("R450");
    expect(formatMoney(1578)).toBe("R1 578");
    expect(formatMoney(0)).toBe("R0");
  });

  it("qualifies by hat count, regardless of the subtotal", () => {
    expect(qualifiesForFreeShipping(0)).toBe(false);
    expect(qualifiesForFreeShipping(1)).toBe(false);
    expect(qualifiesForFreeShipping(2)).toBe(true);
    expect(qualifiesForFreeShipping(3)).toBe(true);
    expect(shippingFee(1)).toBe(90);
    expect(shippingFee(2)).toBe(0);
    expect(grandTotal(550, 1)).toBe(640);
    expect(grandTotal(1100, 2)).toBe(1100);
    expect(grandTotal(1500, 1)).toBe(1590);
    expect(grandTotal(400, 2)).toBe(400);
    expect(shippingFee(2, "founders")).toBe(5000);
  });

  it("quotes dispatch and transit honestly instead of promising overnight delivery", () => {
    expect(SHIPPING_OPTIONS.aramex.description).toContain("Dispatched in 1–3 business days");
    expect(SHIPPING_OPTIONS.aramex.description).toContain("3–5");
    expect(SHIPPING_OPTIONS.aramex.description.toLowerCase()).not.toContain("overnight");
  });
});
