import { describe, it, expect } from "vitest";
import {
  BASE_PRICE,
  SHIPPING_FEE,
  FREE_SHIP_THRESHOLD,
  unitPrice,
  lineTotal,
  formatMoney,
  qualifiesForFreeShipping,
  shippingFee,
  grandTotal,
} from "./pricing";

describe("pricing", () => {
  it("has the updated base price and shipping constants", () => {
    expect(BASE_PRICE).toBe(450);
    expect(SHIPPING_FEE).toBe(90);
    expect(FREE_SHIP_THRESHOLD).toBe(500);
  });

  it("charges full price for a single hat", () => {
    expect(unitPrice(1)).toBe(450);
    expect(lineTotal(1)).toBe(450);
  });

  it("applies 5% off each at qty 2", () => {
    expect(unitPrice(2)).toBe(428);
    expect(lineTotal(2)).toBe(856);
  });

  it("applies 10% off each at qty 3", () => {
    expect(unitPrice(3)).toBe(405);
    expect(lineTotal(3)).toBe(1215);
  });

  it("keeps the best (10%) tier for qty above 3", () => {
    expect(unitPrice(4)).toBe(405);
    expect(lineTotal(4)).toBe(1620);
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
});
